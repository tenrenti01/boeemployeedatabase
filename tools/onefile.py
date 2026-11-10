# Build a single Index.html: no includes, comments and indentation stripped so the
# paste into Apps Script is as small as it can be while staying readable JavaScript.
import re, sys, os

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '..', 'edms', 'Index.html')          # the readable master
OUT = os.path.join(HERE, '..', 'dist', 'Index.min.html')      # paste this one into Apps Script

# States while walking the JavaScript, so a "//" inside a string is never mistaken for a comment.
NORMAL, SQ, DQ, TPL, LINE, BLOCK, REGEX = range(7)
# A "/" right after one of these is the start of a regular expression, not division.
BEFORE_REGEX = set('=(,:[!&|?{};+-*%<>~^') | {'\n'}
KEYWORD_BEFORE_REGEX = ('return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void',
                        'case', 'do', 'else', 'yield', 'await')


def strip_js(src):
    out = []
    code_nl = set()         # newlines that sit in code, not inside a string or template
    state = NORMAL
    tpl_depth = []          # one entry per template literal; counts open braces inside ${ }
    i, n = 0, len(src)
    while i < n:
        c = src[i]
        nxt = src[i + 1] if i + 1 < n else ''
        if state == NORMAL:
            if c == '/' and nxt == '/':
                state = LINE; i += 2; continue
            if c == '/' and nxt == '*':
                state = BLOCK; i += 2; continue
            if c == '/':
                # regex or division? look back at the last meaningful character
                j = len(out) - 1
                while j >= 0 and out[j] in ' \t':
                    j -= 1
                prev = out[j] if j >= 0 else '\n'
                word = ''
                k = j
                while k >= 0 and (out[k].isalnum() or out[k] == '_' or out[k] == '$'):
                    word = out[k] + word; k -= 1
                if prev in BEFORE_REGEX or word in KEYWORD_BEFORE_REGEX:
                    state = REGEX
                out.append(c); i += 1; continue
            if c == "'": state = SQ
            elif c == '"': state = DQ
            elif c == '`': state = TPL; tpl_depth.append(0)
            elif c == '\n': code_nl.add(len(out))
            out.append(c); i += 1; continue
        if state in (SQ, DQ, TPL, REGEX):
            if c == '\\':
                out.append(c); out.append(nxt); i += 2; continue
            if state == SQ and c == "'": state = NORMAL
            elif state == DQ and c == '"': state = NORMAL
            elif state == REGEX and c == '/': state = NORMAL
            elif state == TPL:
                if c == '`' and not tpl_depth[-1]:
                    tpl_depth.pop(); state = NORMAL
                elif c == '$' and nxt == '{':
                    tpl_depth[-1] += 1; out.append(c); out.append(nxt); i += 2; continue
                elif c == '}' and tpl_depth[-1]:
                    tpl_depth[-1] -= 1
            out.append(c); i += 1; continue
        if state == LINE:
            if c == '\n': state = NORMAL; code_nl.add(len(out)); out.append(c)
            i += 1; continue
        if state == BLOCK:
            if c == '*' and nxt == '/': state = NORMAL; i += 2; continue
            if c == '\n': code_nl.add(len(out)); out.append(c)
            i += 1; continue
    # Code newlines are marked; the ones inside strings and templates are left alone.
    text = ''.join(out)
    marked = []
    for k, ch in enumerate(out):
        marked.append('\x00' if (ch == '\n' and k in code_nl) else ch)
    text = ''.join(marked)

    # A newline between statements can go only when the line before it ends with
    # something that can never finish a statement, so nothing changes meaning.
    SAFE_END = set('{};,([=+-*/%&|!?:<>~^')
    pieces = text.split('\x00')
    res = ''
    for piece in pieces:
        # strip indentation at the head and spaces at the tail of each code line
        head = piece.lstrip(' \t') if not res or res.endswith('\n') or res[-1:] in SAFE_END or res == '' else piece.lstrip(' \t')
        head = head.rstrip(' \t')
        if not head:
            continue
        if not res:
            res = head; continue
        last = res.rstrip(' \t')[-1:]
        res = (res.rstrip(' \t') + head) if last in SAFE_END else (res.rstrip(' \t') + '\n' + head)
    return res + '\n'


def strip_css(src):
    out, i, n = [], 0, len(src)
    state = 'n'
    while i < n:
        c, nxt = src[i], src[i + 1] if i + 1 < n else ''
        if state == 'n':
            if c == '/' and nxt == '*': state = 'c'; i += 2; continue
            if c in '\'"': state = c
            out.append(c); i += 1; continue
        if state == 'c':
            if c == '*' and nxt == '/': state = 'n'; i += 2; continue
            i += 1; continue
        if c == '\\': out.append(c); out.append(nxt); i += 2; continue
        if c == state: state = 'n'
        out.append(c); i += 1; continue
    text = ''.join(out)
    text = re.sub(r'\s*\n\s*', '\n', text)
    text = re.sub(r'\n(?=[^@])', '', text)          # one rule per line, @media keeps its line
    text = re.sub(r'\s*([{};:,>])\s*', r'\1', text)
    text = re.sub(r';}', '}', text)
    return text.strip() + '\n'


def main():
    s = open(SRC, encoding='utf-8').read()
    assert '<?' not in s, 'the master page must not already contain a template tag'
    assert s.count("window.__ME = '';") == 1

    # the signed-in email comes from the server, as before
    s = s.replace("window.__ME = '';", "window.__ME = <?!= meJson ?>;\nwindow.__nparts = 0;")

    # squeeze every <style> and <script> block
    def squeeze(m, fn):
        return m.group(1) + fn(m.group(2)) + m.group(3)
    s = re.sub(r'(<style>)(.*?)(</style>)', lambda m: squeeze(m, strip_css), s, flags=re.S)
    s = re.sub(r'(<script>)(.*?)(</script>)', lambda m: squeeze(m, strip_js), s, flags=re.S)

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    open(OUT, 'w', encoding='utf-8').write(s)
    before = os.path.getsize(SRC)
    after = os.path.getsize(OUT)
    print('one file: %.1f KB  (was %.1f KB across 7 files, %.0f%% smaller)'
          % (after / 1024, before / 1024, 100 - after * 100.0 / before))


main()

# Builds the site page (index.html at the top of the repo) from the readable master, edms/Index.html.
#   python3 tools/build.py
# The page talks to the Apps Script /exec link set in config.js; nothing is pasted into Apps Script.
import os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from minify import strip_js, strip_css

SRC = os.path.join(HERE, '..', 'edms', 'Index.html')
OUT = os.path.join(HERE, '..', 'index.html')

HEAD = ('<script src="config.js"></script>\n'
        '<link rel="icon" type="image/png" href="assets/favicon.png">\n'
        '<link rel="apple-touch-icon" href="assets/apple-touch-icon.png">\n'
        '<meta name="theme-color" content="#F0F0F0">\n')


def main():
    s = open(SRC, encoding='utf-8').read()
    assert s.count("window.__ME = '';") == 1 and s.index('<head>') < 200   # the real head is at the top; later ones are print windows
    s = s.replace("window.__ME = '';", "window.__ME = '';\nwindow.__nparts = 0;")
    s = s.replace('<meta charset="utf-8">', '<meta charset="utf-8">\n' + HEAD.rstrip('\n'), 1)
    s = re.sub(r'<title>.*?</title>', '<title>BOE Employee Database</title>', s, count=1)
    s = re.sub(r'(<style>)(.*?)(</style>)', lambda m: m.group(1) + strip_css(m.group(2)) + m.group(3), s, flags=re.S)
    s = re.sub(r'(<script>)(.*?)(</script>)', lambda m: m.group(1) + strip_js(m.group(2)) + m.group(3), s, flags=re.S)
    open(OUT, 'w', encoding='utf-8').write(s)
    # Safety net: every script in the built page must still be valid JavaScript (needs node; skipped without it).
    # A literal closing tag such as </style> or </script> inside a script string breaks the page - write it in two pieces.
    import shutil, subprocess, tempfile
    if shutil.which('node'):
        for i, m in enumerate(re.finditer(r'<script>(.*?)</script>', s, flags=re.S)):
            with tempfile.NamedTemporaryFile('w', suffix='.js', delete=False, encoding='utf-8') as f:
                f.write(m.group(1))
            r = subprocess.run(['node', '--check', f.name], capture_output=True, text=True)
            os.unlink(f.name)
            if r.returncode:
                sys.exit('BUILD FAILED: script %d in index.html is not valid JavaScript. DO NOT PUSH.\n%s' % (i + 1, r.stderr[-600:]))
    print('index.html: %.1f KB (from %.1f KB)' % (os.path.getsize(OUT) / 1024, os.path.getsize(SRC) / 1024))


if __name__ == '__main__':
    main()

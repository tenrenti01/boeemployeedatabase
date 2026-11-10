/**
 * RestoreBirthdays (v2) — writes correct birthdays into the Employees tab
 * as REAL DATE values, anchored to the spreadsheet's own time zone, so they
 * display in your date format (e.g. "Miyerkules, Setyembre 19, 1973") AND can't
 * be shifted a day by a time-zone mismatch.
 *
 * It matches each person in the backup to a row by name, then rewrites every
 * matched birthday as a proper date (noon, in the sheet's time zone) and copies
 * your existing birthday number-format onto it so it looks consistent. Rows not
 * in the backup are left untouched.
 *
 * HOW TO USE
 *   1. Apps Script editor → Files (+) → Script → name it "RestoreBirthdays2" → paste → Save.
 *      (A new name so it doesn't clash with the earlier one. You can delete the old file.)
 *   2. Pick  restoreBirthdays  → Run. First run is a PREVIEW (DRY_RUN = true), writes nothing.
 *      Read View → Logs.
 *   3. Set  DRY_RUN = false , Save, Run again to apply.
 *
 * NOTE: this makes the DATA correct. The app itself still writes dates using the
 * script's time zone, so to stop this forever, set the Apps Script project time
 * zone to match the sheet (Project Settings -> Time zone -> Asia/Manila), or ask
 * for the app_date_ code fix.
 */
var DRY_RUN = true;   // <-- set to false to actually write

// [ Last Name, First Name, Middle Name, Suffix, Birthday(YYYY-MM-DD) ]
var BIRTHDAY_BACKUP = [
  ["ILAO","TORIBIO NOEL","LAGRAMA","","1973-09-19"],
  ["JUNIA","MA. MARGARITA","COLLANTES","","1963-05-05"],
  ["DELA CRUZ","LEONISA","MARTINEZ","","1963-02-04"],
  ["CALLADA","ALLAN","SERRANO","","1970-02-14"],
  ["PASCUAL","FATIMA","MANIEGO","","1999-11-17"],
  ["FLORES","JAIROLD","TUMAGAN","","1990-05-17"],
  ["DELIZO","WILFREDO ARTHUR","CACHERO","","1965-09-05"],
  ["VILLANUEVA","MARK ANTHONY","BRIONES","","1983-10-20"],
  ["DUCA","NIÑO LLOYD","PAGUIRIGAN","","1993-02-11"],
  ["GALICIA","MARCOS","SAMSON","III","1990-06-20"],
  ["TARROZA","MARK CHARLES","MAGRACIA","","1995-02-17"],
  ["FAJUTAG","JOHN RAY","FRONDA","","1991-12-17"],
  ["MACAPANTAO","JALALODEN","POONADATO","","1971-10-17"],
  ["ABONITA","JOMAR RYAN","CALLOS","","1989-12-07"],
  ["SUMERGIDO","HAIECENT MAE","PEDROSO","","1995-12-09"],
  ["DULAY","JOHN CARLO","ALFONSO","","1994-12-11"],
  ["PEREZ","MICHAEL","AUDITOR","","1982-03-31"],
  ["MINA","LUIGI KLEIN","CABANNAG","","1999-10-22"],
  ["TIU","JANUSZ IVANNE","DELA CRUZ","","1996-08-21"],
  ["BERNARDO","ROSE ANN","ROCES","","1986-12-08"],
  ["RAÑOA","VIRGILIO","GALIA","","1962-03-05"],
  ["BELTRAN","ARMANDO","REYES","JR.","1963-02-03"],
  ["FERNANDEZ","ADOLFO","ORALLO","JR.","1965-09-17"],
  ["MARAMARA","ALEXANDER","TORCELINO","","1992-11-02"],
  ["PACINOS","JEFFERSON","CANAPI","","1986-03-27"],
  ["REYES","CAMILLE JOY","PACLE","","1995-04-30"],
  ["DE SAGUN","JOEMEL","DANO","","1993-03-12"],
  ["PAULE","MARK JONELL","PINEDA","","1991-05-23"],
  ["VILLANUEVA","MICHAEL","BRIONES","","1988-03-10"],
  ["MASIDDO","MAYETTE","BAGUNU","","1992-06-16"],
  ["TABIN","BELFORD","MIRAFLOR","","1995-04-11"],
  ["MALIGALIG","ROMMIELYNE","COLIAT","","1996-12-31"],
  ["LEO","HUMPHREY","MODESTO","","2001-09-06"],
  ["DELOS SANTOS","NIKKO","LALONGISIP","","1997-04-24"],
  ["MATIBAG","IVAN JOSHUA","JOCSON","","1999-09-24"],
  ["ABCEDE","RYAN JOSHUA","INSAO","","1997-05-30"],
  ["MANABAT","JERIC","DELA ROSA","","1992-10-14"],
  ["SALONGA","JACOB FREUD","NABUNG","","1997-10-20"],
  ["COMBALICER","OWEN","QUINTO","","1993-07-26"],
  ["JUAN","EDITHA","MENDOZA","","1963-05-02"],
  ["STA. MARIA","LIBERATO","PASCUAL","","1964-12-20"],
  ["PADRE","IRMA","ALCANTARA","","1979-05-21"],
  ["UY","JOAQUIN","DINERO","","1966-03-08"],
  ["VILLANUEVA","MANUEL","ANIBAN","","1973-09-01"],
  ["FLORORITA","EUGENE","SALVA","","1986-12-14"],
  ["CANALAN","MA. CRISTINA","ALABA","","1996-09-25"],
  ["UMALI","EVAN","PAGDILAO","","1970-08-20"],
  ["IRASGA","ALEXANDER","NOVIO","","1971-06-24"],
  ["CUBE","FULGEN","DAPAR","","1971-01-16"],
  ["HAMIS","PAUL","CURILAN","","1965-11-26"],
  ["CASTRO","ALFONSO","MORALES","JR.","1965-06-13"],
  ["PASCUAL","ARNULFO","BAILE","","1968-05-26"],
  ["DOCA","RODOLFO","SALVA","","1984-12-02"],
  ["MAGNO","TOM JEFFERZON","FREZAS","","1983-12-07"],
  ["OBIENA","PATRICIO","AFABLE","","1966-03-25"],
  ["BAUTISTA","MILCOH","SANCIANGCO","","1996-04-24"],
  ["SALVA","PATRICK JADE","VILLEGAS","","1994-09-20"],
  ["MODALES","OSCAR","PASTOR","JR.","1984-02-24"],
  ["NUÑEZ","FRANCIS","LACDAO","","1991-11-29"],
  ["LIWANAG","ECIA SELYN","MARQUEZ","","1992-12-06"],
  ["CABRERA","APPLE JANE","CONTI","","1993-06-23"],
  ["ROCIENTO","BERNADETTE ANNE","ARADA","","1992-09-26"],
  ["MENDOZA","JUSTIN PATRICK","SALLAN","","1993-03-26"],
  ["DELGADO","JOVALE","ESTOCADO","","1966-12-12"],
  ["CABRERA","MICHAEL","GALINDEZ","","1990-05-10"],
  ["NICER","VINCENT JAN","AURELIO","","1991-02-18"],
  ["DE CASTRO","CHRISTOPHER","CALUPE","","1996-12-28"],
  ["JUAN","SHIELA MARIE","MATEO","","1989-06-15"],
  ["REFUERZO","SHALIMAR","PALMA","","1992-09-27"],
  ["ANGELES","VAN JOE","GALANG","","1995-04-30"],
  ["CONSTANTINO","KATRINA MARIE","BALUYOT","","1992-05-24"],
  ["GALLARDO","JAN MICHAEL","FLORES","","1989-12-01"],
  ["NODADO","ANTHONY","MENOR","","1994-04-10"],
  ["TASARRA","SHANDER","TUAZON","","1993-11-16"],
  ["DEL ROSARIO","EDISON MARK CHUBBY","DULNUAN","","1995-01-02"],
  ["PACIS","MARILYN","COLES","","1967-10-13"],
  ["QUARTO","GEMMA","ARCE","","1967-08-25"],
  ["GUANZON","KNIGHT GABRIEL","BERNABE","","1999-04-04"],
  ["POYAOAN","THEODORE GERICHO","RONQUILLO","","1995-03-08"],
  ["SOLOMON","DIANE JOY","CANTERA","","2001-01-09"],
  ["BALBAS","CHESTER","ALBALATE","","1993-03-23"],
  ["CAPARAS","HILARY VEIL","TEMPERATURA","","1997-08-20"],
  ["LAPEÑA","JOHN MICHAEL","PINGCO","","1999-08-14"],
  ["ONNAGAN","RICHARD","VARGAS","","1984-07-17"],
  ["PASCUAL","PAMELA","ANGELES","","1997-04-29"],
  ["SAPITULA","WILFREDO","CORTEZ","","1984-10-10"],
  ["SARI","JESUSA FATIMA","CALANOC","","1998-02-08"],
  ["YABUT","MARICAR","CEZAR","","1990-09-30"],
  ["SOTTO","MEL YNNEB JEREMIAH","LLARENAS","","1993-12-14"],
  ["ANICETO","ROGELIO","CALERO","","1968-11-19"],
  ["CENTENO","MOURICE","SALITA","","1987-09-03"],
  ["DE JESUS","CHRIS JOHN","DE LEON","","2001-07-20"],
  ["DURANA","KEVIN","OCALE","","1994-07-29"],
  ["FERNANDEZ","VERGEL","MENDOZA","","1969-04-29"],
  ["FUGABAN","JOHN PAUL","BINAS","","1992-09-18"],
  ["GARCIA","PATRICK","TABAÑAG","","2000-03-25"],
  ["GONZAGA","SALVADOR","SABULAO","JR.","1984-10-12"],
  ["HERNANDEZ","ALJAY","GERSAYA","","1996-08-31"],
  ["MARTINEZ","WESLEY","RONDARIO","","2004-09-09"],
  ["PASCUAL","PATRICK","ANGELES","","1999-04-10"],
  ["SANDUCO","ORLANDO","JACOB","","1967-11-20"],
  ["SENCIO","BEN JOSEPH","VILLAVICENCIO","","1992-05-18"],
  ["SENCIO","MARK ANTHONY","VILLAVICENCIO","","1987-07-05"],
  ["TORCULAS","TORCULAS","","","1989-06-23"],
  ["ESPINOZA","JONUEZA","REIN","","1992-10-03"],
  ["VALDUEZA","PEDRO","SABANDO","","1965-08-01"],
  ["ABELLA","SHERWIN MARK","MANGULABNAN","","1994-01-21"],
  ["ABERGAS","ERWIN DOUGLAS","CASTILLO","","1974-04-17"],
  ["ABUYAN","JOHN MICHAEL","BALA","","1994-08-17"],
  ["AMISTOSO","AYSHEEN MAE","LABUAN","","1995-05-22"],
  ["ANDAL","MARK ANTHONY","GRUTAS","","1998-11-28"],
  ["AQUINO","ROY","NANONG","","1987-01-14"],
  ["BALINAS","DENVER","ESCLETO","","1986-10-15"],
  ["BALTAZAR","JAZZIL PEARL","OCAMPO","","1996-09-30"],
  ["BANGUILAN","KARL BRYAN","ESPEJO","","2000-12-06"],
  ["BATALLA","FAITH ANGELINE","DE GRANO","","2000-04-19"],
  ["BENDIJO","FRITZIE FAYE","FRANCISCO","","1998-02-24"],
  ["BULAON","JUSTINE","SOSA","","1996-05-30"],
  ["CABILING","HANZ","GELICO","","1995-10-18"],
  ["CAIDOY","JEFFREY","CALUPAZ","","1998-12-13"],
  ["CANTO","JOHN BRYAN","DELA CRUZ","","2001-08-29"],
  ["CARMONA","LEMMANUEL","FECUNDO","","1996-12-08"],
  ["CATALUÑA","WILLIE","ACHACOSO","","1978-01-28"],
  ["CELEBRADO","ALEXANDER","MADARANG","JR.","1996-02-23"],
  ["CRUZ","AARON LOUIS ED","SANTOS","","1999-05-15"],
  ["CRUZ","AMIEL DUKE","TORIO","","1998-07-28"],
  ["DAPLIN","GWYNETH","CADOS","","2000-11-11"],
  ["DECHAVEZ","JOYCE","AMBON","","1997-02-09"],
  ["DEL ROSARIO","MON","JIMENEZ","","1998-05-29"],
  ["DELA CRUZ","CHRISTIAN REY","FERNANDEZ","","1990-08-27"],
  ["DINGLASA","EDWIN","MOLON","","1998-05-29"],
  ["DUNGO","JUSTINE DAVE","BUSTOS","","1999-12-21"],
  ["DUYA","MARK JOSHUA","TENORIA","","2002-10-18"],
  ["EVANGELIO","ALYCXIS JOHN","ARREZA","","2001-02-27"],
  ["FORBES","KEITH JAMEL","TAN","","1995-11-24"],
  ["GARCIA","DAWNAH GIFT","SIERRA","","1992-11-20"],
  ["GELLECANAO","JACOB ZION","NUÑEZ","","2000-11-27"],
  ["GERON","NICHOLE JOHN","DE OCAMPO","","1994-06-24"],
  ["GONZAGA","JOEY ALBERT","PODENIO","","1993-11-30"],
  ["HADJI ALI","MOHAMMAD","PASANDALAN","","1996-01-15"],
  ["HASSAN AL BALOUSHI","NAJELLA","BELONO","","1996-08-29"],
  ["HIMPON","MOHAMMAD RAMZAN","TIDAL","","2000-12-13"],
  ["LAVILLA","RHONA COLEEN","BAGUE","","1997-11-01"],
  ["LAYOSO","MARLON","DALOPE","","1982-03-16"],
  ["LOZANO","KISRTEN CJ","MACABULOS","","2000-07-07"],
  ["MABULAC","KIMBERLY IRA","LEPAOPAO","","2001-02-13"],
  ["MACAM","CHRISTINA GIANNE","ASUNCION","","2001-11-03"],
  ["MACEDA","JONATHAN","GILLO","","1983-02-04"],
  ["MALONDA","GREGORIO","SALAMERO","","1968-06-03"],
  ["MARQUEZ","CARREN","OCAMPO","","1996-09-23"],
  ["MASAKAL","HASNIAH","INDING","","1994-05-29"],
  ["MASDAL","WALDAZA","JAALAIN","","2000-11-13"],
  ["MAUZAR","RONNEL","PANTOJA","","1997-12-20"],
  ["MILANES","JERRY","TAVAS","","1985-11-17"],
  ["MOJICA","MARIANO","GAVIN","","1979-11-16"],
  ["MONIB","JAVER","DITUCALAN","","1988-03-22"],
  ["MONTELOYOLA","MERVIN","DELA CRUZ","","1990-03-10"],
  ["MONTON","JANUARY-ANN","GRANZA","","1999-01-01"],
  ["NACIS","LESLIE","NUDQUE","","1998-02-21"],
  ["NIEBLA","CHARLIE","BANCE","","2001-01-20"],
  ["NUÑEZ","JEFFREY","DELA ROSA","","1999-11-24"],
  ["OLIVAS","EUGENE","MILANES","","1976-10-27"],
  ["ORLEANS","REAN CEASAR","BAQUIANO","","2001-01-10"],
  ["PAÑO","ROYCELYN MAE","PAGARAY","","1995-07-19"],
  ["PENADO","ALTHEA","UY","","1997-03-07"],
  ["PEPITO","TYRON","EMBAYARTE","","1990-01-20"],
  ["POMOY","MARY-ANN","MABUTIN","","1998-09-05"],
  ["PUZON","RICHARD NIKKO","GAWAT","","1997-11-08"],
  ["QUILAO","JOYCE ANNE","DATINGUINOO","","2003-03-23"],
  ["QUINTANS","JUSTINE CELINA","NAVASERO","","1995-02-21"],
  ["RADIAMODA","HISSAN","IMAM","","1995-03-06"],
  ["RAÑESES","JOHN JOSHUA","BAJAR","","1993-06-12"],
  ["RELUCIO","MICO BRETTE","QUERIMIT","","2001-07-21"],
  ["REYES","ROSALIE","LAPING","","2001-07-07"],
  ["SAN DIEGO","ADRIAN","ESQUIVEL","","2000-03-25"],
  ["SANDOVAL","JHON KENNETH","CIPRIANO","","2002-06-06"],
  ["SANQUI","RENE MICHAEL","GARCIA","","1983-10-27"],
  ["SARIP","ARAFAT","NACAN","","1992-09-27"],
  ["SASUMAN","ABIGAIL","ESTRADA","","2001-08-15"],
  ["SILLOS","JOSHUA RHEY","PERSIGAS","","1999-03-09"],
  ["STA. ANA","PAULINE CAROLE","GAUD","","1995-04-23"],
  ["TAMPIOC","EDRISA","PEDRO","","1999-03-11"],
  ["TAN","CARISSA GRACE","KONG","","1993-06-02"],
  ["TAN","CHASTE BERNARD","ONG","","2001-04-16"],
  ["TEREZ","CLEFFORD","SALE","","2000-02-18"],
  ["TRINIDAD","RUTHER MATTHEW","PACAMARRA","","1995-07-10"],
  ["VALDEZ","JOEL","AGPAOA","","1977-12-29"],
  ["ESTANISLAO","ARIES","CAHILIG","","1993-09-13"],
  ["PALLARCA","CHRISTIAN RYAN","BALIBER","","1999-01-08"],
  ["ANISLAG","JESSIE","SABELLA","","1973-12-31"],
  ["LIGUID","LARRY","PALOMAR","","1966-11-02"],
  ["SENCIO","BEN","SAPITANAN","","1961-12-16"],
  ["AGGABAO","RONALD","GATAN","","1989-12-07"],
  ["ALICUMAN","JOENATHAN","SORIANO","","1982-03-12"],
  ["ARO","RAMIL","ALCOBER","","1993-01-18"],
  ["ATIENZA II","CONRADO","GARCIA","","2000-09-25"],
  ["BAGUNU","JED","GUMARO","","1989-10-28"],
  ["BALATIBAT","MARY JANET","CORONEL","","1970-01-20"],
  ["BALIGOD","JOHN","BURAGA","JR.","1986-03-29"],
  ["BASILAN","ERWIN JAY","ADENIC","","1984-07-30"],
  ["BASILAN","FLORENZ","ADENIC","","1986-03-21"],
  ["BUIZA","JOVERT","DAYAP","","1987-08-10"],
  ["CABRERA","ERIC","BASCO","","1981-03-28"],
  ["CALAG","ROBINI","ORIBE","","1971-02-14"],
  ["CALIDRO","MARCOS","DELA CRUZ","SR.","1973-06-22"],
  ["CASUMPANG","FEDERICO","ALIM","","1967-02-27"],
  ["CENIZA","EDUARDO","SUMALINOG","","1980-06-19"],
  ["CONCEPCION","RYAN","JACINTO","","1999-08-18"],
  ["CONSOLACION","LOUIS SEVERINO","JARLEGO","","1995-06-13"],
  ["CUREG","JOEY","RODRIGUEZ","","1988-06-03"],
  ["DALUPERIT","JAMES","BERNARD","","1997-07-24"],
  ["DELA CRUZ","REY","CRUZ","","1963-09-24"],
  ["DELA ROSA","LOU BRYAN","NAVARRO","","1995-11-01"],
  ["DELIN","FRANCISCO","CONSOLACION","JR.","1989-09-25"],
  ["DEYPALAN","JERRY","DIVICAIS","","1966-07-31"],
  ["DIESTA","ROGELIO","PACUNDO","JR.","1968-03-30"],
  ["ESCALERA","RODOLFO","VILLARIN","III","1987-12-31"],
  ["ESCALONA","REXCELL MAXIMO GREG","ESPELITA","","1983-06-11"],
  ["FERRER","KRUSHEV","PALMA","","1989-08-29"],
  ["GAMUTAN","SAM","MANGELEN","","1972-03-09"],
  ["GARCIA","JOHN LLYOD AARON","ALCANTARA","","1999-04-18"],
  ["GARDINER","SOLITO","SABAR","","1985-07-29"],
  ["GUINTANG","ALADIN","KABASALAN","","1975-07-05"],
  ["JUMIG","OLIVER","MANCE","","1983-10-07"],
  ["LAZARRA","MARK JULIUS","BESMONTE","","1997-12-18"],
  ["LEABRES","PAOLO MAR","CONFESOR","","1992-02-01"],
  ["MACALI","ANTONIO","GACULA","JR.","1990-09-30"],
  ["MALENAB","JOHN DEL","SORIANO","","1996-03-25"],
  ["MAMUYAC","DOMINIQUE","LACUATA","","1987-10-05"],
  ["MAQUINAD","ROMEL","GATAN","","1994-01-14"],
  ["MARQUEZ","KYLES NICOLE","LIQUIDO","","1996-10-07"],
  ["MAYO","RICARDO","DELA CRUZ","JR.","1995-11-29"],
  ["MAYO","FRANCIS","SORIANO","","1988-08-17"],
  ["MENDOZA","CHRISTOPHER","AFICIAL","","1977-11-08"],
  ["NAMOCO","PABLITO","MAPA","JR.","1994-06-16"],
  ["NAZARENO","ROLANDO","COMANDANTE","JR.","1966-02-07"],
  ["OLINARES","ALEX","ORILLO","","1976-03-10"],
  ["PARRAS","LEONIDES","SISON","","1985-12-15"],
  ["PARRAS","RENATO","SISON","JR.","1993-10-12"],
  ["PARUNGAO","JONEL","PERALTA","","1993-04-01"],
  ["PASAPORTE","RADJHAN","LANADO","","1982-02-27"],
  ["PASTRANA","ALDVIC","BULAQUIA","","1983-08-20"],
  ["QUIA","VON RAYMOND","PETORAL","","1981-08-15"],
  ["RAMOS","RUDOLPH","QUINTANO","","1974-02-14"],
  ["RODA","ROGER","CATIAN","","1960-08-15"],
  ["SANCHEZ","ALDRIN","SALUTA","JR.","1997-09-10"],
  ["SINGH","DEXTER","CANONIGO","","1975-10-27"],
  ["TACUB","JIRO","ANNIS","","1993-11-15"],
  ["TALOZA","VERLYN","ORTEZA","","1967-09-16"],
  ["TEJAM","DEAN ADRIAN","FALCIS","","1996-07-28"],
  ["TIENZO","MANUEL","MAGLALANG","","1964-08-16"],
  ["TOLENTINO","JUAN ROMANO","DIZON","","1998-07-25"],
  ["TONGCO","ROVIC","MERCADO","","1999-10-07"],
  ["TORRES","GREGORIO","MENESES","","1963-06-01"],
  ["TORRES","JONATHAN ROY","GERNALE","","1991-07-17"],
  ["UNICA","MICHAEL ANGELO","PEÑAROYO","","1988-05-09"],
  ["USOP","BADRUDIN","KABASALAN","","1976-12-04"],
  ["USOP","OMAR RAJIE","KABASALAN","","1998-09-06"],
  ["USOP","THO","ANGKAD","","1988-01-01"],
  ["VINARAO","SISTONES","BAGUNU","","1988-11-08"],
  ["VIRAY","ALEXANDER","SUNGA","","1972-12-29"],
  ["ZARATAN","MARK JAYSON","DOOT","","1989-12-22"],
  ["ZIPAGAN","KAYVEE","FUGABAN","","1995-10-29"],
  ["DEMEGILLO","LARRY","CABIA","","1976-04-10"],
  ["LA ROSA","PABLO","PEÑA","","1973-04-12"],
  ["LEVITA","JD CHRIS","CABIGAS","","1988-12-06"],
  ["MORTA","JUENE RUSSEL","LOPEZ","","1999-07-24"],
  ["PABILONIA","JON","BARRIOS","","1994-07-21"],
  ["AMADO","RICHARD","PEÑAFIEL","","1985-10-18"],
  ["AMBROCIO","ANTHONY","CRUZ","JR.","2002-01-28"],
  ["AMEROL","ALEJANDRO","SUNGAHIB","","1982-11-11"],
  ["AMISTOSO","KHENT LLOYD","ROMA","","1998-10-21"],
  ["AMPUAN","DANNY","DAWAB","","1981-05-15"],
  ["ANDAY","ERNEL","MANANSALA","","1976-11-27"],
  ["ARANDID","REKEN","PEÑANUEVA","","1995-03-06"],
  ["ARBOLENTE","DARRYL","AMIGABLE","","1990-02-27"],
  ["BANTILLO","ANER","DEDIL","","1990-03-11"],
  ["BARTOLOME","JOSELITO","SACDALAN","","1972-04-24"],
  ["BAUTISTA","EDILWIN","RODRIGO","","1976-06-11"],
  ["BAUTISTA","MARCELO","ROMERO","II","1994-03-16"],
  ["BEBERINO","JUAN CARLO","NIEGAS","","1993-03-07"],
  ["CASALIN","REYMOND","ALMENDRAS","","1983-04-24"],
  ["CRUZ","ROMMEL","SANTOS","","1971-09-30"],
  ["DALIN","PABLO","AGGABAO","","1993-09-17"],
  ["DELA CRUZ","JAMES","CASTILLO","","1966-01-12"],
  ["DELA GUARDIA","RENZ","LAPIRA","","1996-01-18"],
  ["EBRAHIM","WAHID","TAHA","","1982-03-13"],
  ["ESTRADA","RICHARD","BAISA","","1985-01-13"],
  ["FONTANILLA","KIAN CHRISTOPHER","BAMBICO","","2002-06-07"],
  ["FORASTEROS","RONEL","AMISTOSO","","1987-02-24"],
  ["GARCIA","MARK ALBERT","DOMACENA","","1997-09-07"],
  ["GENIEBLA","FRANCISCO","SUMAGAYSAY","","1988-05-25"],
  ["GIMOTEA","DANIEL LOIS","HILAPO","","1990-04-09"],
  ["GUBALLA","RUSTICO","MONTOYA","JR.","1984-02-07"],
  ["GUINTANG","EBRAHIM","IMAM","","1995-01-29"],
  ["HUNAS","RIQUE","PIMENTEL","","1977-12-08"],
  ["INOCENCIO","RAFFY","PIMENTEL","","1990-03-01"],
  ["IRASGA","GIOVANNI ALEXIS","FUENTES","","1992-10-02"],
  ["LABUGA","NORVIE","JUBAY","","1977-08-11"],
  ["LAO-ANG","JULIENNE","TAN","","1991-07-26"],
  ["LUCAS","MARK VINCENT","INTIA","","1999-10-25"],
  ["LUMABI","STEVE","TALAMAYAN","","1991-10-23"],
  ["MACAS","PEDRO","MADERAL","JR.","1977-10-09"],
  ["MACMOD","GUIALAL","GANDAWALI","","1964-12-04"],
  ["MADLA","MARLON","RIVERA","","1987-03-09"],
  ["MADRIAGA","JOEL","ROSIETE","","1991-08-16"],
  ["MAEJAN","DANTE","DURAN","","1974-11-25"],
  ["MAGLALANG","JIM JAYSON","PRESTO","","1993-07-30"],
  ["MAMAUAG","RANDY","VINARAO","","1987-11-18"],
  ["MANALASAL","BASIR","ANGKAD","","1989-12-02"],
  ["MINGUITO","ROGELIO","REMERATA","JR.","1979-05-11"],
  ["MISPEL","CANDAO","SINDATU","","1991-02-02"],
  ["MONTES","MARK DAN","CARPIO","","1989-02-02"],
  ["MULINGBAYAN","GRACE ANN","BAUTISTA","","1987-07-07"],
  ["MUNCAL","JOHN BENEDICT","CASAS","","1999-07-10"],
  ["NAKAN","SANDIALE","ALI","","1985-08-05"],
  ["NANTES","CHRISTIAN NOEL","MARIQUINA","","1987-07-27"],
  ["PARONE","FRANKLIN","PIÑERO","","1973-11-19"],
  ["RAMOS","EDWARD","MANGUNAY","","1974-11-14"],
  ["RELATIVO","JEMEL","HABANA","","1976-03-27"],
  ["REYES","JOHN KENNETH","MONTILLA","","1990-01-18"],
  ["ROXAS","JOHN HARVEY","TAYAG","","1999-11-15"],
  ["SAMBAJON","KARL ANGELO","NIEGAS","","1996-04-15"],
  ["SANDIGAN","MICHAEL","USOP","","1986-01-01"],
  ["SANTOS","CEDRIC","DELA CRUZ","","2004-09-10"],
  ["SERAFICA","KEVIN BRIAN","RESILLA","","2000-04-06"],
  ["SUNGA","ROQUE","MANINANG","","1982-08-16"],
  ["TABUGO","ELBERT","OJERIO","","1975-09-13"],
  ["TAN","WILLIE","SAGUIGUIT","","1968-07-19"],
  ["TIENZO","NEIL JOSHUA","DUNGO","","1997-07-08"],
  ["TOLENTINO","MIGUEL RAFAEL","DIZON","","1991-03-13"],
  ["UTTO","MICHAEL","MOKAMAD","","1987-05-13"],
  ["VALENTIN","GABRIEL","BAYLON","","1986-10-07"],
  ["VIRAY","MARLON","DELA PEÑA","","1992-06-17"],
  ["MANIO","JHON KHENNEDY","AGBON","","2002-10-24"],
  ["PAJANUSTAN","RAMIL","TUBISE","","1996-09-17"],
  ["REQUINA","DEONAR","DIONISIO","","1998-12-24"],
  ["TALAMAYAN","ROBIN","TOMINES","","1992-06-10"],
  ["WICO","RONALDO","PINCA","","1995-03-08"],
  ["SANTOS","ROCKY","LORENZO","","1973-10-27"]
];

function restoreBirthdays() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var pid = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (pid) { try { ss = SpreadsheetApp.openById(pid); } catch (e) {} }
  if (!ss) throw new Error('No spreadsheet. Run from the bound sheet or set the SHEET_ID property.');
  var sh = ss.getSheetByName('Employees');
  if (!sh) throw new Error('No "Employees" tab.');
  var tz = ss.getSpreadsheetTimeZone();

  var vals = sh.getDataRange().getValues();
  var headers = vals[0].map(function (h) { return String(h).trim(); });
  var cLast = headers.indexOf('Last Name'), cFirst = headers.indexOf('First Name');
  var cMid = headers.indexOf('Middle Name'), cSuf = headers.indexOf('Suffix');
  var cBday = headers.indexOf('Birthday');
  if (cLast < 0 || cFirst < 0 || cBday < 0)
    throw new Error('Employees tab needs Last Name, First Name and Birthday columns.');

  var n = vals.length - 1;
  if (n < 1) throw new Error('No employee rows.');
  var curFmts = sh.getRange(2, cBday + 1, n, 1).getNumberFormats();

  // Use the format of an existing real-date birthday cell so written cells match.
  var refFmt = '';
  for (var r = 1; r <= n; r++) {
    if (Object.prototype.toString.call(vals[r][cBday]) === '[object Date]') { refFmt = curFmts[r - 1][0]; break; }
  }
  if (!refFmt) refFmt = 'dddd", "mmmm" "d", "yyyy';

  function norm(s) { return String(s == null ? '' : s).toUpperCase().replace(/\s+/g, ' ').trim(); }
  function nsuf(s) { return norm(s).replace(/\./g, ''); }
  function key(l, f, m) { return norm(l) + '|' + norm(f) + '|' + norm(m); }

  var index = {};
  for (var i = 1; i <= n; i++) {
    if (norm(vals[i][cLast]) === '' && norm(vals[i][cFirst]) === '') continue;
    var k = key(vals[i][cLast], vals[i][cFirst], cMid >= 0 ? vals[i][cMid] : '');
    (index[k] = index[k] || []).push(i);
  }

  // Start from current values/formats; only matched rows change.
  var outVals = [], outFmts = [];
  for (var j = 1; j <= n; j++) { outVals.push([vals[j][cBday]]); outFmts.push([curFmts[j - 1][0]]); }

  var wrote = 0, notFound = [], ambiguous = [], matched = {};
  for (var b = 0; b < BIRTHDAY_BACKUP.length; b++) {
    var rec = BIRTHDAY_BACKUP[b], last = rec[0], first = rec[1], mid = rec[2], suf = rec[3], iso = rec[4];
    var cand = index[key(last, first, mid)] || [];
    var pick = -1;
    if (cand.length === 1) pick = cand[0];
    else if (cand.length > 1) {
      var bySuf = cand.filter(function (x) { return nsuf(cSuf >= 0 ? vals[x][cSuf] : '') === nsuf(suf); });
      if (bySuf.length === 1) pick = bySuf[0];
      else { ambiguous.push(last + ', ' + first + (mid ? ' ' + mid : '') + '  (' + cand.length + ' matches)'); continue; }
    }
    if (pick < 0) { notFound.push(last + ', ' + first + (mid ? ' ' + mid : '')); continue; }
    matched[pick] = true;
    // Noon in the SHEET's own time zone -> displays as the right calendar day, always.
    outVals[pick - 1][0] = Utilities.parseDate(iso + ' 12:00:00', tz, 'yyyy-MM-dd HH:mm:ss');
    outFmts[pick - 1][0] = refFmt;
    wrote++;
  }

  var notInBackup = [];
  for (var p = 1; p <= n; p++) {
    if (norm(vals[p][cLast]) === '' && norm(vals[p][cFirst]) === '') continue;
    if (!matched[p]) notInBackup.push(norm(vals[p][cLast]) + ', ' + norm(vals[p][cFirst]));
  }

  Logger.log('=== Birthday restore v2 ' + (DRY_RUN ? '(PREVIEW — nothing written)' : '(WRITING as real dates)') + ' ===');
  Logger.log('Time zone used (sheet): ' + tz + ' | format applied: ' + refFmt);
  Logger.log('Backup people: ' + BIRTHDAY_BACKUP.length + ' | will set: ' + wrote +
    ' | not found: ' + notFound.length + ' | ambiguous: ' + ambiguous.length + ' | in sheet not in backup: ' + notInBackup.length);
  if (notFound.length) Logger.log('\nNOT FOUND:\n - ' + notFound.join('\n - '));
  if (ambiguous.length) Logger.log('\nAMBIGUOUS (left unchanged):\n - ' + ambiguous.join('\n - '));
  if (notInBackup.length) Logger.log('\nIN SHEET BUT NOT IN BACKUP (left as-is):\n - ' + notInBackup.join('\n - '));

  if (DRY_RUN) { Logger.log('\nPREVIEW ONLY. Set DRY_RUN = false and Run again to write.'); return 'Preview: would set ' + wrote + ' birthdays.'; }

  sh.getRange(2, cBday + 1, n, 1).setNumberFormats(outFmts);
  sh.getRange(2, cBday + 1, n, 1).setValues(outVals);
  SpreadsheetApp.flush();
  Logger.log('\nDONE. Set ' + wrote + ' birthdays as real, time-zone-safe dates.');
  return 'Set ' + wrote + ' birthdays.';
}

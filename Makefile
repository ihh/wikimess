BRACERY = node_modules/bracery
ASSETS = assets/js/wikimess
PARSERS = src

NODE_BIN = node_modules/.bin
BROWSERIFY = $(NODE_BIN)/browserify

LOAD_DATA = bin/load-data.js

all: $(ASSETS)/vars.js $(ASSETS)/bracery.js

start:
	$(LOAD_DATA) -s

testdnd:
	$(LOAD_DATA) -l -S data/symbols/dnd.txt -T data/templates/dnd.txt -P data/players/dnd.json -S data/symbols/dariusk_corpora.json

clean:
	mysql -u root -e 'drop database wikimess; create database wikimess;'

postinstall: $(ASSETS)/bracery.js config/local.js

$(ASSETS)/bracery.js: $(BRACERY)/web/bracery.js
	cp $< $@

config/local.js:
	test -e $@ || cp config/local_example.js $@

$(PARSERS)/vars-shim.js:
	echo "window.VarsHelper = require('./vars');" >$@

$(ASSETS)/vars.js: $(PARSERS)/vars.js $(PARSERS)/vars-shim.js
	$(BROWSERIFY) $(PARSERS)/vars-shim.js >$@

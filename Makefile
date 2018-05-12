BRACERY = node_modules/bracery
ASSETS = assets/js/wikimess
PARSERS = misc/parsers

NODE_BIN = node_modules/.bin
BROWSERIFY = $(NODE_BIN)/browserify

testdnd:
	bin/load-data.js -l -S data/symbols/dnd.txt -T data/templates/dnd.txt -P data/players/dnd.json -S data/symbols/dariusk_corpora.json

clean:
	mysql -u root -e 'drop database wikimess; create database wikimess;'

postinstall:
	cp $(BRACERY)/browser/bracery.js $(ASSETS)/bracery.js

$(PARSERS)/vars-shim.js:
	echo "window.VarsHelper = require('./vars');" >$@

$(ASSETS)/vars.js: $(PARSERS)/vars.js $(PARSERS)/vars-shim.js
	$(BROWSERIFY) $(PARSERS)/vars-shim.js >$@

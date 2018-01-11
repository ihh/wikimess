

PEGFILES = $(wildcard *.peg.js)

all: $(subst .peg.js,.dep,$(PEGFILES))

clean:
	rm $(subst .peg.js,.js,$(PEGFILES)) *.input.js *.shim.js *.browser.js

%.input.js: %.peg.js %.header.js
	cat $*.peg.js $*.header.js >$@

%.js: %.input.js
	cat $< | pegjs >$@

%.shim.js:
	echo "window.$*Parser = require('./$*.js');" >$@

%.browser.js: %.shim.js %.js
	browserify $*.shim.js >$@

%.dep: %.browser.js
	cp $< ../../assets/js/wikimess/$*.js

.SECONDARY:

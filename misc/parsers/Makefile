
%.js: %.peg
	pegjs $< >$@

%.shim.js:
	echo "window.$*Parser = require('./$*.js');" >$@

%.browser.js: %.shim.js %.js
	browserify $*.shim.js >$@

%.dep: %.browser.js
	cp $< ../../assets/js/wikimess/$*.js

JSFILES = $(wildcard *.js)
JSONFILES = $(subst .js,.json,$(JSFILES))

all: $(JSONFILES)

test:
	@echo JSFILES = $(JSFILES)
	@echo JSONFILES = $(JSONFILES)

clean:
	rm $(JSONFILES)

%.json: %.js
	node $< >$@

mobythes.aur:
	curl -L -O http://www.dcs.shef.ac.uk/research/ilash/Moby/mthes.tar.Z
	tar xvzf mthes.tar.Z
	mv mthes/$@ $@
	rm -rf mthes*

dict:
	curl -L -O http://wordnetcode.princeton.edu/wn3.1.dict.tar.gz
	tar xvzf wn3.1.dict.tar.gz

wordnet.txt: wordnet.json
	node -e 'fs=require("fs");wn=JSON.parse(fs.readFileSync("$<"));console.log(wn.map(x=>(">"+x.name+"\n"+x.rules.map(r=>r[0]).join("\n")+"\n")).join("\n")+"\n")'

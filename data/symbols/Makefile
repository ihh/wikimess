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

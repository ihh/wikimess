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

moby.txt: mobythes.aur
	cat $< | perl -pe 's/\r/\n/g' | perl -ne '@s=split/,/;$$n=lc$$s[0];$$n=~s/[\- ]/_/g;print">$$n\n",join("\n",@s),"\n"' >$@

mobythes.aur:
	curl -L -O http://www.dcs.shef.ac.uk/research/ilash/Moby/mthes.tar.Z
	tar xvzf mthes.tar.Z
	mv mthes/$@ $@

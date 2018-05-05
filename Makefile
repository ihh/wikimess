
testdnd:
	bin/load-data.js -l -S data/symbols/dnd.txt -T data/templates/dnd.txt -P data/players/dnd.json -S data/symbols/dariusk_corpora.json

clean:
	mysql -u root -e 'drop database wikimess; create database wikimess;'

RHS
  = OuterNodeList

Node
  = "\\n" { return "\n" }
  / "\\t" { return "\t" }
  / "\\" escaped:[\s\S] { return escaped }
  / text:[^\$&\^\{\}\|\\]+ { return text.join("") }
  / Symbol
  / Function
  / VarAssignment
  / VarLookup
  / Alternation
  / char:[\$&\^] { return char }

NodeList
  = head:Node tail:NodeList {
      return typeof(head) === 'string' && tail.length && typeof(tail[0]) === 'string'
     	? [head + tail[0]].concat(tail.slice(1))
        : [head].concat(tail)
    }
  / head:Node { return [head] }
  / "" { return [] }

OuterNode
  = Node
  / char:. { return char }

OuterNodeList
  = head:OuterNode tail:OuterNodeList {
      return typeof(head) === 'string' && tail.length && typeof(tail[0]) === 'string'
     	? [head + tail[0]].concat(tail.slice(1))
        : [head].concat(tail)
    }
  / head:OuterNode { return [head] }
  / "" { return [] }

Symbol
  = "$" sym:Identifier { return makeSugaredSymbol (sym) }
  / "${" _ sym:Identifier _ "}" { return makeSugaredSymbol (sym) }

Function
  = "&" func:FunctionName "{" args:NodeList "}" { return makeFunction (func, args) }
  / "&" func:FunctionName sym:Symbol { return makeFunction (func, [sym]) }
  / "&" func:FunctionName alt:Alternation { return makeFunction (func, [alt]) }
  / "&" func:FunctionName lookup:VarLookup { return makeFunction (func, [lookup]) }
  / "&" func:FunctionName innerFunc:Function { return makeFunction (func, [innerFunc]) }

FunctionName = "uc" / "cap" / "plural" / "a"

VarLookup
  = "^" varname:Identifier { return makeLookup (varname) }
  / "^{" _ varname:Identifier _ "}" { return makeLookup (varname) }

VarAssignment
  = "^" varname:Identifier "={" args:NodeList "}" { return makeAssign (varname, args) }
  / "^" varname:Identifier "=" alt:Alternation { return makeAssign (varname, [alt]) }
  / "^" varname:Identifier "=" sym:Symbol { return makeAssign (varname, [sym]) }
  / "^" varname:Identifier "=" func:Function { return makeAssign (varname, [func]) }
  / "^" varname:Identifier "=" lookup:VarLookup { return makeAssign (varname, [lookup]) }

Alternation
  = "{" head:NodeList "|" tail:AltList "}" { return makeAlternation ([head].concat(tail)) }

AltList
  = head:NodeList "|" tail:AltList { return [head].concat(tail) }
  / head:NodeList { return [head] }

CappedIdentifier
  = firstChar:[A-Z] mid:[A-Za-z_0-9]* lc:[a-z] rest:[A-Za-z_0-9]* { return firstChar + mid.join("") + lc + rest.join("") }

UpperCaseIdentifier
  = firstChar:[A-Z] rest:[A-Z_0-9]* { return firstChar + rest.join("") }

Identifier
  = firstChar:[A-Za-z_] rest:[A-Za-z_0-9]* { return firstChar + rest.join("") }

_ "whitespace"
  = [ \t\n\r]*

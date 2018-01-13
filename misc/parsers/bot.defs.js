function initMachine (md) { return addToMachine ({ out: {} }, md) }
function addToMachine (machine, md) {
  var ml = md.ml, tl = md.tl
  ml.forEach (function (mood) {
    var out = machine.out[mood] || []
    machine.out[mood] = out
    tl.forEach (function (transition) {
      out.push (transition)
    })
  })
  if (ml.length)
    machine.start = ml[0]
  return machine
}

// https://stackoverflow.com/questions/15621145/partial-sort-in-javascript/15621422
function bisect (items, compare, x, lo, hi) {
  if (typeof(lo) == 'undefined') lo = 0
  if (typeof(hi) == 'undefined') hi = items.length
  while (lo < hi) {
    var mid = Math.floor ((lo + hi) / 2)
    if (compare (x, items[mid]) < 0)
      hi = mid
    else
      lo = mid + 1
  }
  return lo
}

function insort (items, compare, x) {
  var b = bisect (items, compare, x)
  items.splice (b, 0, x)
}

module.exports = {

  partialSort: function (items, k, compare) {
    var smallest = []
    compare = compare || function (a, b) { return a - b }
    for (var i = 0, len = items.length; i < len; ++i) {
      if (smallest.length < k || compare (items[i], smallest[smallest.length - 1]) < 0) {
        insort (smallest, compare, items[i])
        if (smallest.length > k)
          smallest.pop()
      }
    }
    return smallest
  },
  
  sampleByWeight: function (weights) {
    var totalWeight = weights.reduce (function (total, w) { return total + w }, 0)
    var w = totalWeight * Math.random()
    for (var i = 0; i < weights.length; ++i)
      if ((w -= weights[i]) <= 0)
	return i
    return undefined
  },

  multiSampleByWeight: function (weights, n) {
    var samples = []
    var totalWeight = weights.reduce (function (total, w) { return total + w }, 0)
    while (n > 0 && totalWeight > 0) {
      var w = totalWeight * Math.random()
      for (var i = 0; i < weights.length; ++i)
	if ((w -= weights[i]) <= 0) {
	  samples.push (i)
	  totalWeight -= weights[i]
	  weights[i] = 0
	  break
	}
      --n
    }
    return samples
  },

}

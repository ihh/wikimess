var name = 'SvgSpriteCache'
module.exports = function(grunt) {

  grunt.config.set('svg_sprite', {
    dev: {
      src: require('../pipeline').svgFilesToInject,
      dest: '.tmp/public/js/sprites.js'
    }
  });

  grunt.registerMultiTask('svg_sprite', 'Takes a list of .svg files and creates a JavaScript cache', function() {
    var js = ['var x = {};']
    this.files.forEach (function (f) {
      f.src.forEach (function (src) {
        var d = src.split('/')
        var name = d[d.length-1].replace('.svg','')
        var svg = grunt.file.read(src).replace(new RegExp('[\\n\\t\\s]+','g'),' ')
        js.push ('x["' + name + '"]="' + svg.replace(new RegExp('"','g'),'\\"') + '";')
      })
    })
    js.push ('window.' + name + ' = x;')
    grunt.file.write (this.data.dest, js.join('\n') + '\n')
  })
};

module.exports = function(grunt) {

  grunt.config.set('svg_sprite', {
    options: {
      mode: {
        symbol: true
      }
    },
    dev: {
      expand: true,
      cwd: 'assets',
      src: require('../pipeline').svgFilesToInject,
      dest: '.tmp/public/sprites/'
    }
  });

  grunt.loadNpmTasks('grunt-svg-sprite');
};

/**
 * `compileAssets`
 *
 * ---------------------------------------------------------------
 *
 * This Grunt tasklist is not designed to be used directly-- rather
 * it is a helper called by the `default`, `prod`, `build`, and
 * `buildProd` tasklists.
 *
 * For more information see:
 *   http://sailsjs.org/documentation/anatomy/my-app/tasks/register/compile-assets-js
 *
 */
module.exports = function(grunt) {
  grunt.registerTask('test-svg-sprite', [
    'svg_sprite:dev'
  ]);

  grunt.registerTask('compileAssets', [
    'svg_sprite:dev',
    'clean:dev',
    'jst:dev',
    'less:dev',
    'copy:dev',
    'coffee:dev'
  ]);
};

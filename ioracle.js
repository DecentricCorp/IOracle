const plugin_dir = './ledgers/'
var ui = require('./ui.js')
const fs = require('fs')
var plugins = []
fs.readdir(plugin_dir, (err, files) => {
    files.forEach(file => {
        var pieces = file.split('.')
        var name = pieces[0]
        var ext = pieces[1]
        if (ext === "js") {
            plugins[plugins.length] = {name: name, file: require(plugin_dir+file)}
        }
    });
})

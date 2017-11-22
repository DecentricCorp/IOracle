var CLI = require('clui'),
    Spinner = CLI.Spinner,
    Line = CLI.Line;

function make_spinner(msg) {
    var spinner = new Spinner(msg || '', spinnerStyle(2))
    spinner.start()
    return spinner
}

function spinnerStyle(style){
    switch (style) {
        case 1:
            return ['◜','◠','◝','◞','◡','◟']
            break;
        case 2: 
            return ['⣾', '⣽', '⣻', '⢿', '⡿', '⣟', '⣯', '⣷']
            break;
        default:
            return ['|', '/', '-', ' ']
            break;
    }
}

module.exports.make_spinner = make_spinner

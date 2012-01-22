
(function() {

    function zip(a, b) {
        var ret = {}
        for (var i=0; i<a.length; i++) {
            ret[a[i]] = b[i]
        }
        return ret
    }

    function strip(text) {
        return text.replace(/^\s+|[\s\r\n]+$/m, '')
    }

    function log() {
        if (Tinker.debug) {
            console.log(arguments)
        }
    }

    function error(text) {
        console.log(text)
    }

    // In theory this supports a bunch of weird notation like
    // 1e4, but we'll only tell people about ints and floats.
    function number(s) {
        var n = parseFloat(s)
        if (isNaN(n)) {
            error(s+' is not really a number.')
            return 0
        }
        return n
    }

    function integer(s) {
        return Math.round(number(s))
    }

    reserved = {
        'define':1,
        'run':1,
        'dot':1,
        'move':1,
        'repeat':1
    }

    initial = {
        x: 100, y: 100
    }

    // turtle's initial state
    Tinker = {
        'heading': 0,
        'rad': 0,
        'x': initial.x,
        'y': initial.y,
        'pen': true,
        'lastx':initial.x,
        'lasty':initial.y,
        'debug': false
    }
    TinkerOrig = {}
    for (var k in Tinker) {
        TinkerOrig[k] = Tinker[k]
    }

    Tinker._tokenize = function (text) {
        var program = []

        // "stanzas" are separated by one or more blank lines.
        var stanzas = text.toLowerCase().split(/^\s*$/m)

        // each line in a stanza is a command
        for (var i=0; i<stanzas.length; i++) {
            var stanza = []
            var lines = stanzas[i].split(/[\r\n]+/m)

            if (!lines || lines.length==0) { continue; }

            for (var j=0; j<lines.length; j++) {
                var line = strip(lines[j])
                if (!line) { continue; }
                var tokens = line.split(/\s+/)
                stanza.push(tokens)
            }
            if (stanza.length > 0) {
                program.push(stanza)
            }
        }
        return program
    }

    Tinker._eval = function (stanza, env, recurse) {
        for (var j=0; j<stanza.length; j++) {
            var fn = stanza[j][0]

            // variable replacement
            for (var i=1; i<stanza[j].length; i++) {
                if (stanza[j][i] in env) {
                    stanza[j][i] = env[stanza[j][i]]
                }
            }

            // todo: simple infix math? "move 5*foo"

            if (fn == 'define') {
                if (j > 0) {
                    error('You can only define a new command at the begining of a stanza.')
                    return
                }
                if (recurse) {
                    Tinker._define.call({}, stanza)
                }
                return

            } else if (fn == 'repeat') {
                if (j != stanza.length-1) {
                    error('You can only repeat at the end of a stanza.')
                    return
                }
                if (recurse) {
                    Tinker.repeat([stanza[j][1]], stanza)
                }
                return

            } else if (Tinker[fn]) {
                Tinker[fn].call({}, stanza[j].slice(1), null)

            } else {
                error('Command "'+fn+'" not found.');
                return
            }
        }
    }

    Tinker.run = function(text) {
        var p = Tinker._tokenize(text)
        for (var i=0; i<p.length; i++) {
            Tinker._eval(p[i], {}, true)
        }
    }

    Tinker._define = function() {
        var fn = arguments[0][0][1]
        var argnames = arguments[0][0].slice(2)
        var body = arguments[0].slice(1)

        if (fn[0] == '_' || fn in reserved) {
            error("Can't define a command named "+fn+". Skipping.")
        }

        Tinker[fn] = function() {
            argvals = arguments[0]
            if (argnames.length != argvals.length) {
                error(fn+' expected '+argnames.length+' arguments, got '+argvals.length)
                return
            }
            var args = zip(argnames, argvals)
            Tinker._eval(body, args, true)
        }
    }

    Tinker.repeat = function(args, body) {
        // Assumes that one invocation has already happened.
        // Quirk of the language "spec" puts REPEAT at the end.
        for (var i=0; i<integer(args[0])-1; i++) {
            Tinker._eval(body, {}, false)
        }
    }

    Tinker.turn = function(args) {
        var plusminus = (args[0]=='right' ? 1 : -1)
        var deg = number(args[1])
        var delta = (deg * plusminus)
        Tinker.heading = (Tinker.heading + delta) % 360
        Tinker.rad = Tinker.heading * (Math.PI/180)
        Tinker.redraw()
    }

    // Given a heading and x,y coords, calculate the x,y coords
    // after travelling forward some unit distance. This is the only
    // trigonometry I know, and I cribbed it from a friend.
    Tinker.move = function(args) {
        var distance = number(args[0])
        Tinker.lastx = Tinker.x
        Tinker.lasty = Tinker.y
        Tinker.x += Math.cos(Tinker.rad) * distance
        Tinker.y += Math.sin(Tinker.rad) * distance
        Tinker.redraw(true)
    }

    Tinker.penup = function() {
        Tinker.pen = false
    }

    Tinker.pendown = function() {
        Tinker.pen = true
    }

    Tinker.reset = function() {
        for (var k in TinkerOrig) {
            Tinker[k] = TinkerOrig[k]
        }
        Tinker.init()
    }

    // Override these
    Tinker.redraw = function() {}
    Tinker.dot = function() {}
    Tinker.init = function() {}

    // Implement the visuals. This is separate from the core parser & state.
    // An alternative might be to compile a Tinker program to a set of SVG paths
    // and simply animateAlong. That's an interesting idea.
    Raphael(function () {
        var r = Raphael("holder")

        Tinker.init = function() {
            r.clear()
            x = r.image("turtle-64.png", Tinker.x-16, Tinker.y-16, 32, 32)
        }

        Tinker.redraw = function(move) {
            var xy = [Math.round(Tinker.x-initial.x),Math.round(Tinker.y-initial.y)]
            var t = 'T'+xy+'R'+Tinker.heading
            x.transform(t)
            if (Tinker.pen && move) {
                xy = [Math.round(Tinker.x),Math.round(Tinker.y)]
                var lxy = [Math.round(Tinker.lastx),Math.round(Tinker.lasty)]
                r.path('M'+lxy+'L'+xy).toBack()
            }
        }

        Tinker.dot = function() {
            r.circle(Tinker.x, Tinker.y, 3).attr({fill: "#000", "stroke-width": 0}).toBack()
        }

        Tinker.init()
        go()
        document.getElementById('repl').focus()

    });
})();

function go() {
    var program = document.getElementById('repl').value
    Tinker.run(program)
}

function closepop() {
    document.getElementById('popshare').style['display'] = 'none'
}

function popshare(slug) {
    var url = 'http://www.laurenipsum.org/tinkerpad/' + slug
    document.getElementById('popshare').style['display'] = 'block'
    document.getElementById('url').value = url
    document.getElementById('fburl')['share_url'] = url
    document.getElementById('url').blur()
    document.getElementById('url').select()
}

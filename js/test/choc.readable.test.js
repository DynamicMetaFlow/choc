// Generated by CoffeeScript 1.6.3
(function() {
  var assert, coffee, esprima, inspect, pp, puts, readable, should, testHelper, _ref;

  testHelper = require('./test_helper');

  _ref = require("util"), puts = _ref.puts, inspect = _ref.inspect;

  pp = function(x) {
    return puts(inspect(x, null, 1000));
  };

  esprima = require("esprima");

  assert = require('assert');

  should = require("should");

  readable = require("../src/readable");

  coffee = require("coffee-script");

  describe('Readable', function() {
    var message, messageE;
    message = function(code, opts) {
      var nodes;
      if (opts == null) {
        opts = {};
      }
      nodes = esprima.parse(code, {
        range: true,
        loc: true
      }).body[0];
      pp(nodes);
      return readable.readableNode(nodes, opts);
    };
    messageE = function(code, opts) {
      var beforeCode, toEval;
      if (opts == null) {
        opts = {};
      }
      beforeCode = opts.before || "";
      toEval = beforeCode + ";" + code + "; " + message(code, opts);
      return eval(toEval);
    };
    it('simple assignment', function() {
      var code;
      code = "var foo = 0";
      return messageE(code)[0].message.should.eql('Create the variable <span class="choc-variable">foo</span> and set it to <span class="choc-value">0</span>');
    });
    it('assignment and increment', function() {
      var code;
      code = "foo = 1 + bar";
      return pp(message(code));
    });
    it('function calls with no annotations', function() {
      var code;
      code = "console.log('hello')";
      return pp(message(code));
    });
    return it.only('function calls with annotations', function() {
      var before, code, result;
      before = "annotatedfn = () ->\nannotatedfn.__choc_annotation = (args) ->\n  return \"'i was annotated with ' + \" + \"'\" + readable.generateReadableExpression(args[0]) + \"'\"";
      before = coffee.compile(before, {
        bare: true
      });
      code = "annotatedfn('hello')";
      result = messageE(code, {
        before: before
      });
      return result[0].message.should.eql('i was annotated with hello');
    });
  });

}).call(this);

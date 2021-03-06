(function() {
  var ALL_STATEMENTS, Choc, HOIST_STATEMENTS, PLAIN_STATEMENTS, Tracer, annotate, debug, deep, escodegen, esmorph, esprima, estraverse, generateAnnotatedSource, generateAnnotatedSourceM, generateCallTrace, generateStatement, generateTraceTree, generateVariableAssignment, generateVariableDeclaration, inspect, isHoistStatement, isPlainStatement, isStatement, noop, pp, puts, readable, scrub, _, _ref,
    __bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; };

  _ref = require("util"), puts = _ref.puts, inspect = _ref.inspect;

  pp = function(x) {
    return puts(inspect(x, null, 1000));
  };

  esprima = require("esprima");

  escodegen = require("escodegen");

  esmorph = require("esmorph");

  estraverse = require('../../lib/estraverse');

  _ = require("underscore");

  readable = require("./readable");

  debug = require("debug")("choc");

  deep = require("deep");

  Choc = {
    VERSION: "0.0.1",
    PAUSE_ERROR_NAME: "__choc_pause"
  };

  PLAIN_STATEMENTS = ['BreakStatement', 'ContinueStatement', 'DoWhileStatement', 'DebuggerStatement', 'EmptyStatement', 'ForStatement', 'ForInStatement', 'LabeledStatement', 'SwitchStatement', 'ThrowStatement', 'TryStatement', 'WithStatement', 'ExpressionStatement', 'VariableDeclaration', 'CallExpression'];

  HOIST_STATEMENTS = ['ReturnStatement', 'WhileStatement', 'IfStatement'];

  ALL_STATEMENTS = PLAIN_STATEMENTS.concat(HOIST_STATEMENTS);

  isStatement = function(nodeType) {
    return _.contains(ALL_STATEMENTS, nodeType);
  };

  isPlainStatement = function(nodeType) {
    return _.contains(PLAIN_STATEMENTS, nodeType);
  };

  isHoistStatement = function(nodeType) {
    return _.contains(HOIST_STATEMENTS, nodeType);
  };

  generateVariableDeclaration = function(varInit) {
    var identifier;
    identifier = "__choc_var_" + Math.floor(Math.random() * 1000000);
    return {
      type: 'VariableDeclaration',
      kind: 'var',
      declarations: [
        {
          type: 'VariableDeclarator',
          id: {
            type: 'Identifier',
            name: identifier
          },
          init: varInit
        }
      ]
    };
  };

  generateVariableAssignment = function(identifier, valueNode) {
    return {
      type: 'ExpressionStatement',
      expression: {
        type: 'AssignmentExpression',
        operator: '=',
        left: {
          type: 'Identifier',
          name: identifier
        },
        right: valueNode
      }
    };
  };

  generateStatement = function(code) {
    return esprima.parse(code).body[0];
  };

  generateTraceTree = function(node, opts) {
    var line, messagesString, nodeType, range, signature;
    if (opts == null) {
      opts = {};
    }
    nodeType = node.type;
    line = node.loc.start.line;
    range = node.range;
    messagesString = readable.readableJsStr(node, opts);
    signature = "__choc_trace({ lineNumber: " + line + ", range: [ " + range[0] + ", " + range[1] + " ], type: '" + nodeType + "', messages: " + messagesString + " });";
    return esprima.parse(signature).body[0];
  };

  generateCallTrace = function(node, opts) {
    var line, messagesString, nodeType, original_arguments, original_function, original_object, original_property, range, trace_opts, trace_opts_tree;
    if (opts == null) {
      opts = {};
    }
    nodeType = node.type;
    line = node.loc.start.line;
    range = node.range;
    if (node.callee.type === "Identifier") {
      original_function = node.callee.name;
      original_arguments = node["arguments"];
      opts.originalArguments || (opts.originalArguments = original_arguments);
      messagesString = readable.readableJsStr(node, opts);
      trace_opts = "var opts = { lineNumber: " + line + ", range: [ " + range[0] + ", " + range[1] + " ], type: '" + nodeType + "', messages: " + messagesString + " };";
      trace_opts_tree = esprima.parse(trace_opts).body[0].declarations[0].init;
      node.callee.name = "__choc_trace_call";
      return node["arguments"] = [
        {
          type: 'ThisExpression'
        }, {
          type: 'Literal',
          value: null
        }, {
          type: 'Identifier',
          name: original_function
        }, {
          type: 'ArrayExpression',
          elements: original_arguments
        }, trace_opts_tree
      ];
    } else {
      original_object = node.callee.object;
      original_property = node.callee.property;
      original_arguments = node["arguments"];
      opts.originalArguments || (opts.originalArguments = original_arguments);
      messagesString = readable.readableJsStr(node, opts);
      trace_opts = "var opts = { lineNumber: " + line + ", range: [ " + range[0] + ", " + range[1] + " ], type: '" + nodeType + "', messages: " + messagesString + " };";
      trace_opts_tree = esprima.parse(trace_opts).body[0].declarations[0].init;
      node.callee.name = "__choc_trace_call";
      node.callee.type = "Identifier";
      return node["arguments"] = [
        {
          type: 'ThisExpression'
        }, original_object, {
          type: 'Literal',
          value: original_property.name
        }, {
          type: 'ArrayExpression',
          elements: original_arguments
        }, trace_opts_tree
      ];
    }
  };

  generateAnnotatedSource = function(source) {
    var candidate, candidates, e, element, error, hoister, innerBlockContainer, line, newAssignmentNode, newCodeTree, newPosition, newSource, newVariableName, node, nodeType, originalExpression, parent, parentPathAttribute, parentPathIndex, pos, range, traceTree, tree, _i, _len;
    try {
      tree = esprima.parse(source, {
        range: true,
        loc: true
      });
      debug(inspect(tree, null, 100));
    } catch (_error) {
      e = _error;
      error = new Error("choc source parsing error");
      error.original = e;
      throw error;
    }
    candidates = [];
    estraverse.traverse(tree, {
      enter: function(node, parent, element) {
        if (isStatement(node.type)) {
          return candidates.push({
            node: node,
            parent: parent,
            element: element
          });
        }
      }
    });
    hoister = {
      'IfStatement': 'test',
      'WhileStatement': 'test',
      'ReturnStatement': 'argument'
    };
    for (_i = 0, _len = candidates.length; _i < _len; _i++) {
      candidate = candidates[_i];
      node = candidate.node;
      parent = candidate.parent;
      element = candidate.element;
      parentPathAttribute = element.path[0];
      parentPathIndex = element.path[1];
      if (!parent.hasOwnProperty("__choc_offset")) {
        parent.__choc_offset = 0;
      }
      nodeType = node.type;
      line = node.loc.start.line;
      range = node.range;
      pos = node.range[1];
      if (isStatement(nodeType)) {
        newPosition = null;
        if (isHoistStatement(nodeType)) {
          originalExpression = node[hoister[nodeType]];
          newCodeTree = generateVariableDeclaration(originalExpression);
          newVariableName = newCodeTree.declarations[0].id.name;
          traceTree = generateTraceTree(node, {
            hoistedName: newVariableName,
            hoistedOriginal: originalExpression
          });
          parent[parentPathAttribute].splice(parentPathIndex + parent.__choc_offset, 0, newCodeTree);
          parent.__choc_offset = parent.__choc_offset + 1;
          node[hoister[node.type]] = {
            type: 'Identifier',
            name: newVariableName
          };
          if (_.isNumber(parentPathIndex)) {
            newPosition = parentPathIndex + parent.__choc_offset;
            parent[parentPathAttribute].splice(newPosition, 0, traceTree);
            parent.__choc_offset = parent.__choc_offset + 1;
          } else {
            puts("WARNING: no parent idx");
          }
          if (nodeType === "WhileStatement") {
            newAssignmentNode = generateVariableAssignment(newVariableName, originalExpression);
            innerBlockContainer = node.body.body;
            innerBlockContainer.push(newAssignmentNode);
            innerBlockContainer.push(traceTree);
          }
        } else if (nodeType === 'CallExpression') {
          traceTree = generateCallTrace(node);
        } else if (isPlainStatement(nodeType)) {
          if (nodeType === "ExpressionStatement" && node.expression.type === "CallExpression") {
            true;
          } else {
            traceTree = generateTraceTree(node);
            if (_.isNumber(parentPathIndex)) {
              newPosition = parentPathIndex + parent.__choc_offset + 1;
              parent[parentPathAttribute].splice(newPosition, 0, traceTree);
              parent.__choc_offset = parent.__choc_offset + 1;
            } else {
              puts("WARNING: no parent idx");
            }
          }
        }
      }
    }
    newSource = escodegen.generate(tree, {
      format: {
        compact: false
      }
    });
    debug(newSource);
    return newSource;
  };

  generateAnnotatedSourceM = _.memoize(generateAnnotatedSource);

  Tracer = (function() {
    function Tracer(options) {
      if (options == null) {
        options = {};
      }
      this.traceCall = __bind(this.traceCall, this);
      this.trace = __bind(this.trace, this);
      this.frameCount = 0;
      this.onMessages = function() {};
      this.clearTimeline();
    }

    Tracer.prototype.clearTimeline = function() {
      return this.timeline = {
        steps: [],
        stepMap: {},
        maxLines: 0
      };
    };

    Tracer.prototype.trace = function(opts) {
      var _this = this;
      this.frameCount = 0;
      return function(info) {
        var error, _base, _name;
        _this.timeline.steps[_this.frameCount] = {
          lineNumber: info.lineNumber
        };
        (_base = _this.timeline.stepMap)[_name = _this.frameCount] || (_base[_name] = {});
        _this.timeline.stepMap[_this.frameCount][info.lineNumber - 1] = info;
        _this.timeline.maxLines = Math.max(_this.timeline.maxLines, info.lineNumber);
        info.frameNumber = _this.frameCount;
        _this.frameCount = _this.frameCount + 1;
        if (_this.frameCount >= opts.count) {
          _this.onMessages(info.messages);
          error = new Error(Choc.PAUSE_ERROR_NAME);
          error.info = info;
          throw error;
        }
      };
    };

    Tracer.prototype.traceCall = function(tracer) {
      return function(thisArg, target, fn, args, opts) {
        var propDesc;
        tracer(opts);
        if (target != null) {
          propDesc = Object.getOwnPropertyDescriptor(target, fn);
          if (propDesc && propDesc["set"]) {
            return propDesc.set.apply(target, args);
          } else {
            return target[fn].apply(target, args);
          }
        } else {
          return fn.apply(thisArg, args);
        }
      };
    };

    return Tracer;

  })();

  noop = function() {};

  scrub = function(source, count, opts) {
    var afterAll, afterEach, appendSource, beforeEach, e, executionTerminated, gval, locals, localsStr, newSource, onCodeError, onFrame, onMessages, onTimeline, tracer;
    onFrame = opts.onFrame || noop;
    beforeEach = opts.beforeEach || noop;
    afterEach = opts.afterEach || noop;
    afterAll = opts.afterAll || noop;
    onTimeline = opts.onTimeline || noop;
    onMessages = opts.onMessages || noop;
    onCodeError = opts.onCodeError || noop;
    locals = opts.locals || {};
    appendSource = opts.appendSource || "";
    newSource = generateAnnotatedSourceM(source);
    tracer = new Tracer();
    tracer.onMessages = onMessages;
    tracer.onTimeline = onTimeline;
    executionTerminated = false;
    try {
      beforeEach();
      global.__choc_trace = tracer.trace({
        count: count
      });
      global.__choc_trace_call = tracer.traceCall(__choc_trace);
      global.__choc_first_message = function(messages) {
        var _ref1;
        if (_.isNull((_ref1 = messages[0]) != null ? _ref1.message : void 0)) {
          return "TODO";
        } else {
          return messages[0].message;
        }
      };
      global.map = function(fn, items) {
        return _.map(items, fn);
      };
      global.annotationFor = readable.annotationFor;
      global.locals = locals;
      locals.Choc = Choc;
      localsStr = _.map(_.keys(locals), function(name) {
        return "var " + name + " = locals." + name + ";";
      }).join("; ");
      gval = eval;
      gval(localsStr + "\n" + newSource + "\n" + appendSource);
      return executionTerminated = true;
    } catch (_error) {
      e = _error;
      if (e.message === Choc.PAUSE_ERROR_NAME) {
        return onFrame(e.info);
      } else {
        throw e;
      }
    } finally {
      afterEach();
      if (executionTerminated || (opts.animate != null)) {
        afterAll({
          frameCount: tracer.frameCount
        });
        onTimeline(tracer.timeline);
      }
    }
  };

  annotate = function(fn, annotation) {
    return fn.__choc_annotation = function(args) {
      return annotation(args);
    };
  };

  exports.scrub = scrub;

  exports.generateAnnotatedSource = generateAnnotatedSource;

  exports.readable = readable;

  exports.annotate = annotate;

  exports.Editor = require("./choc-editor").choc.Editor;

  exports.AnimationEditor = require("./choc-animation-editor").choc.AnimationEditor;

}).call(this);

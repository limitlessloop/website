var fs = require("fs");
var Highlights = require("highlights");
var prettyprint = require("@marko/prettyprint");
var resolveFrom = require("resolve-from");
var redent = require("redent");
const localStorageUtil = require("~/util/localstorage");
const syntaxSwitchEnabled = true;

var highlighter = new Highlights();
highlighter.requireGrammarsSync({
  modulePath: require.resolve("language-marko/package.json")
});

module.exports = function(el, context) {
  var builder = context.builder;
  var file = el.argument;
  var lines =
    el.getAttributeValue("lines") && el.getAttributeValue("lines").value;
  var scopeName;
  var html;
  var code;
  var lang;

  if (file) {
    file = resolveFrom(context.dirname, eval(file));
    code = fs.readFileSync(file, "utf-8");
    lang = file.slice(file.lastIndexOf(".") + 1);
  } else {
    code = el.body.firstChild.argument.value;
    lang = el.getAttributeValue("lang").value;
  }

  if (lang === "js" || lang === "javascript" || lang === "json") {
    scopeName = "source.js";
  } else if (lang === "css") {
    scopeName = "source.css";
  } else if (lang === "html") {
    scopeName = "text.html.basic";
  } else if (lang === "xml" || lang === "marko") {
    scopeName = "text.marko";
  } else if (lang === "jsx") {
    scopeName = "source.js.jsx";
  } else if (lang === "bash") {
    scopeName = "source.shell";
  }

  code = redent(
    code
      .replace(/&lt;/g, "<")
      .replace(/&#36;/g, "$")
      .replace(/&amp;/g, "&")
  ).trim();

  html = highlighter.highlightSync({
    fileContents: code,
    scopeName: scopeName
  });

  if (lines) {
    var currentLine = 0;
    var currentIndex = 0;
    lines = parseLineRange(lines);
    html = html.replace(/<div class="line">/g, match => {
      if (++currentLine === lines[currentIndex]) {
        currentIndex++;
        return `<div class="line highlight">`;
      }
      return match;
    });
  }

  context.addDependency(require.resolve("~/global-style/syntax.css"));

  var prev = getPreviousNonWhitespaceNode(el);
  var innerNode = getSingleInnerEmNode(prev);
  var innerIsLiteralText =
    innerNode &&
    innerNode.type === "Text" &&
    innerNode.argument.type === "Literal";

  if (innerIsLiteralText) {
    var fileNameDiv = context.createNodeForEl("div");
    fileNameDiv.setAttributeValue(
      "class",
      builder.literal("code-block-filename")
    );
    fileNameDiv.appendChild(innerNode);
    innerNode.argument.value.replace(/\:$/, '');
    prev.replaceWith(fileNameDiv);
  }

  if (syntaxSwitchEnabled && !context.data.markoSyntaxScriptAdded) {
    const key = localStorageUtil.getMarkoWebsiteKey("syntax");
    el.insertSiblingBefore(
      builder.html(
        builder.literal(`<script>
            if(localStorage.getItem('${key}') === 'concise') {
                document.body.classList.add('concise');
            }
        </script>`)
      )
    );
    context.data.markoSyntaxScriptAdded = true;
  }

  function getPreviousNonWhitespaceNode(node) {
    var prev = node.container.getPreviousSibling(node);
    while (
      prev &&
      prev.type === "Text" &&
      prev.argument.type === "Literal" &&
      /^\s*$/.test(prev.argument.value)
    ) {
      prev = prev.container.getPreviousSibling(prev);
    }
    return prev;
  }

  function getSingleInnerEmNode(node) {
    if (is(node, 'p')) {
      var child = onlyChild(node);
      if (is(child, 'em')) {
        return onlyChild(child);
      }
    }

    function is(node, tagName) {
      return node && node.tagName === tagName;
    }

    function onlyChild(node) {
      return node && node.body.length === 1 ? node.firstChild : undefined;
    }
  }

  if (
    syntaxSwitchEnabled &&
    scopeName === "text.marko" &&
    !el.getAttribute("no-switch")
  ) {
    try {
      var next = el.container.getNextSibling(el);
      var nextIsCodeBlock = next && next.tagName === "code-block";
      var nextLang = nextIsCodeBlock && next.getAttributeValue("lang").value;
      var nextIsMarko = nextLang === "marko";
      var concise;

      if (nextIsMarko) {
        concise = highlighter.highlightSync({
          fileContents: next.body.firstChild.argument.value,
          scopeName: scopeName
        });
        next.detach();
      } else {
        concise = highlighter.highlightSync({
          fileContents: prettyprint(code, {
            filename: "template.marko",
            syntax: "concise"
          }),
          scopeName: scopeName
        });
      }

      var markoCodeBlock = context.createNodeForEl("code-block-marko");
      markoCodeBlock.setAttributeValue("html", builder.literal(html));
      markoCodeBlock.setAttributeValue("concise", builder.literal(concise));
      return el.replaceWith(markoCodeBlock);
    } catch (e) {
      console.error(e);
    }
  }

  el.replaceWith(builder.html(builder.literal(html)));
};

function parseLineRange(string) {
  var ranges = string.split(",");
  var lines = [];

  ranges.forEach(range => {
    var limits = range.trim().split("-");
    var start = parseInt(limits[0].trim());
    var end = limits[1] ? parseInt(limits[1].trim()) : start;

    for (var i = start; i <= end; i++) {
      lines.push(i);
    }
  });

  return lines.sort((a, b) => a - b);
}

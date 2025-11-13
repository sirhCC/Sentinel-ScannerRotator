define(['base/js/namespace', 'base/js/dialog', 'jquery'], function (Jupyter, dialog, $) {
  'use strict';

  function regexes() {
    // Small subset of built-in patterns for demo purposes
    return [
      { name: 'AWS Access Key', re: /AKIA[0-9A-Z]{16}/g },
      { name: 'Generic API Key', re: /(api[_-]?key)\s*[:=]\s*['\"][A-Za-z0-9_\-]{16,}['\"]/gi },
      { name: 'Password Assign', re: /password\s*[:=]\s*['\"][^'\"]{6,}['\"]/gi },
    ];
  }

  function scanNotebook() {
    var findings = [];
    var cells = Jupyter.notebook.get_cells();
    for (var i = 0; i < cells.length; i++) {
      var c = cells[i];
      if (!c || !c.get_text) continue;
      var txt = String(c.get_text());
      var lines = txt.split(/\r?\n/);
      var patterns = regexes();
      for (var li = 0; li < lines.length; li++) {
        var line = lines[li];
        for (var pi = 0; pi < patterns.length; pi++) {
          var p = patterns[pi];
          var re = new RegExp(p.re.source, p.re.flags); // clone to reset lastIndex
          re.lastIndex = 0;
          var m;
          while ((m = re.exec(line)) !== null) {
            var match = m[0];
            var preview = line.trim().slice(0, 200);
            findings.push({
              cell: i + 1,
              line: li + 1,
              pattern: p.name,
              match: match,
              preview: preview,
            });
            if (!re.global) break; // avoid infinite loop for non-global regex
          }
        }
      }
    }
    return findings;
  }

  function showFindings(findings) {
    if (!findings.length) {
      dialog.modal({
        title: 'Sentinel Scan',
        body: 'No findings found.',
        buttons: { OK: {} },
      });
      return;
    }
    var body = $('<div/>').css({ 'max-height': '60vh', overflow: 'auto' });
    var table = $('<table/>').addClass('table table-striped table-condensed');
    var thead = $('<thead/>').append(
      '<tr><th>Cell</th><th>Line</th><th>Pattern</th><th>Snippet</th></tr>',
    );
    table.append(thead);
    var tbody = $('<tbody/>');
    findings.forEach(function (f) {
      var row = $('<tr/>')
        .append($('<td/>').text(f.cell))
        .append($('<td/>').text(f.line))
        .append($('<td/>').text(f.pattern))
        .append($('<td/>').text(f.preview));
      tbody.append(row);
    });
    table.append(tbody);
    body.append(table);
    dialog.modal({
      title: 'Sentinel Scan Findings',
      body: body,
      buttons: { OK: {} },
    });
  }

  function onClick() {
    try {
      var findings = scanNotebook();
      showFindings(findings);
    } catch (e) {
      console.error('Sentinel scan error', e);
      dialog.modal({
        title: 'Sentinel Scan Error',
        body: String((e && e.message) || e),
        buttons: { OK: {} },
      });
    }
  }

  function load_ipython_extension() {
    Jupyter.toolbar.add_buttons_group(
      [
        {
          label: 'Sentinel Scan',
          icon: 'fa-shield',
          callback: onClick,
        },
      ],
      'sentinel-scan-btn-group',
    );
  }

  return {
    load_ipython_extension: load_ipython_extension,
  };
});

function bandwidth(div) {
  // Requires datejs, datetables, jquery
  var xfer_ajax_datasource = "bandwidth.php";
  var json_cache = {};
  var container = $("<div>");
  var table = $('<table id="bandwidth" cellpadding="0" cellspacing="0" border="0">');
  div.append(container);
  div.append(table);

  var units_div = $("<div>").addClass("units");
  var units_select = $("<select>");
  {
    $.each([["Auto", "-1"], ["Bytes", "1"], ["KiB", "1024"], 
      ["MiB", "1048576"], ["GiB", "1073741824"]], function(i, v) {
        units_select.append($("<option>").text(v[0]).attr("value", v[1]));
    });
    units_select.attr("selectedIndex", "0");
    units_div.append($("<label>").append("Units").append(units_select));
  }

  var period_div = $("<div>").addClass("period");
  var period_select = $("<select>");
  {
    $.each(["monthly", "daily", "hourly"], function(i, v) {
      period_select.append($("<option>").text(v));
    });
    period_select.val("daily");
    period_div.append($("<label>").append("Period").append(period_select));
  }

  var metric_div = $("<div>").addClass("metric");
  var metric_select = $("<select>");
  {
    $.each(["tx_bytes", "rx_bytes", "vnc-tx_bytes", "vnc-rx_bytes"], function(i, v) {
      metric_select.append($("<option>").text(v));
    });
    metric_select.attr("selectedIndex", "0");
    metric_div.append($("<label>").append("Metric").append(metric_select));
  }

  var date_div = $("<div>").addClass("date_range");
  var idate_start = $("<input>").attr("type", "text");
  var idate_stop = $("<input>").attr("type", "text");
  date_div.append($("<label>").append("Start").append(idate_start)).append($("<label>").append("Stop").append(idate_stop));
  {
    idate_start.val("-30 days");
    idate_stop.val("today");
  }

  var button_div = $("<div>").addClass("buttons");
  var reload_button = $("<input>").attr("type", "button").attr("value", "reload");
  button_div.append(reload_button);

  var toolbar = $("<div>");
  $.each([units_div, date_div, period_div, metric_div, button_div], function(i, v) {
    toolbar.append(v);
  });

  reload_table_direct = function(fcomplete, period, metric, date_start, date_stop) {
    date_start = Date.parse(date_start).toString("yyyy-M-d");
    date_stop = Date.parse(date_stop).toString("yyyy-M-d");
    var key = period+metric+date_start+date_stop;
    if (typeof json_cache[key] != 'undefined') {
      return fcomplete(json_cache[key]);
    }
    var complete = function(jqXHR) {
      var jsonp = $.parseJSON(jqXHR.responseText);
      jsonp.rows = [];
      $.each(jsonp.data, function(system, column_data) {
        var row = [system];
        $.each(jsonp.columns, function(i, date) {
          if(date in column_data) {
            row.push(column_data[date]);
          }
        });
        jsonp.rows.push(row);
      });
      jsonp.data = null;
      json_cache[key] = jsonp;
      fcomplete(json_cache[key]);
    };
    var remote_opts = {
      complete: complete,
      url: xfer_ajax_datasource,
      data: {
        load : "all",
        date_start  : date_start,
        date_stop   : date_stop, 
        date_step   : period, 
        metric      : metric
      }
    };
    var local_opts = {
      complete: complete,
      url: period+"-"+metric+".json",
    };
    $.ajax(window.location.hostname.match(/localhost/) ? local_opts : remote_opts);
  }

  fnRowCallback = function(nRow, aData, iDisplayIndex, iDisplayIndexFull) {
    var unit = units_select.val();
    unit = unit ? parseInt(unit) : 1;
    if(isNaN(unit)) unit = 1;
    $('td.format_bytes', nRow).each(function(i, td) {
      var n = parseInt(aData[td.cellIndex+1]);
      var div = unit;
      var u = "";
      if (div < 0) {
        if (n >= 1073741824) {
          div = 1073741824;
          u = " GiB";
        } else if(n >= 1048576) {
          div = 1048576;
          u = " MiB";
        } else if(n >= 1024) {
          div = 1024;
          u = " KiB";
        } else if(n > 0) {
          div = 1;
        }
      }
      if(div > 0 && n > 0) {
        text = (n/div).toFixed(div == 1 ? 0 : 2);
        if($(td).text() != "0") {
          $(td).text(text + u);
        }
      }
    });
    return nRow;
  }

  initialize_table = function(json) {
    if(typeof dt != 'undefined') {
      dt.fnDestroy();
      $("thead", table).remove();
    }

    table_opts = {
      "sScrollX": "100%",
      // "sScrollXInner" : "150%",
      // "bScrollCollapse": true,
      "bAutoWidth": false,
      "bJQueryUI": true,
      "sPaginationType": "full_numbers",
      "iDisplayLength": 10,
      "aLengthMenu": [[10, 20, 40, 60, -1], [10, 20, 40, 60, "All"]],
      "fnRowCallback" : fnRowCallback,
      "aoColumnDefs" : [{ 
          "aTargets"  : [0],
          "sClass"    : "text_left system",
          "asSorting" : ["asc", "desc"],
        }, { 
          "aTargets"  : ["_all"],
          "sClass"    : "text_right format_bytes",
          "asSorting" : ["desc", "asc"],
      }]
    };
    table_opts.aoColumns = [{sTitle: "System"}];
    if(json) {
      $.each(json.columns, function(i, date) {
        table_opts.aoColumns.push({sTitle:date});
      });
      table_opts.aaData = json.rows;
    } 
    dt = table.dataTable(table_opts);
    new FixedColumns(dt);
    $(".dataTables_length").after(toolbar);

    period_select.change(reload_table);
    metric_select.change(reload_table);
    reload_button.click(reload_table);
    units_select.change(function() {
      table.dataTable().fnDraw();
    });

    $.each(dt.fnSettings().aoData, function(i, v) {
      $("td.format_bytes", v.nTr).each(function(j, w) {
        var n = parseInt(v._aData[w.cellIndex+1]);
        if(n >= 1073741824) {
          $(w).addClass("gigabyte");
        } else if(n >= 1048576) {
          $(w).addClass("megabyte");
        } else if(n >= 1024) {
          $(w).addClass("kilobyte");
        } else if(n > 0) {
          $(w).addClass("byte");
        } else if(n == 0) {
          $(w).addClass("no-data");
        }
      });
    });
  }
  reload_table = function() {
    reload_table_direct(initialize_table, 
      period_select.val(), 
      metric_select.val(), 
      idate_start.val(), 
      idate_stop.val());
  }
  reload_table();
}

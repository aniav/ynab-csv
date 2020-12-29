// This class does all the heavy lifting.
// It takes the and can format it into csv
window.DataObject = class DataObject {
  constructor() {
    this.base_json = null;
  }

  // Parse base csv file as JSON. This will be easier to work with.
  // It uses http://papaparse.com/ for handling parsing
  parseCsv(csv, encoding, startAtRow=1, delimiter=null) {
    let existingHeaders = [];
    let config = {
      header: true,
      skipEmptyLines: true,
      beforeFirstChunk: function(chunk) {
        var rows = chunk.split("\n");
        var startIndex = startAtRow - 1;
        rows = rows.slice(startIndex);
        return rows.join("\n");
      },
      transformHeader: function(header) {
        if (header.trim().length == 0) {
          header = "Unnamed column";
        }
        if (existingHeaders.indexOf(header) != -1) {
          let new_header = header;
          let counter = 0;
          while(existingHeaders.indexOf(new_header) != -1){
            counter++;
            new_header = header + " (" + counter + ")";
          }
          header = new_header;
        }
        existingHeaders.push(header);
        return header;
      }
    }
    if (delimiter !== null) {
      config.delimiter = delimiter
    }
    var result = Papa.parse(csv, config);
    return (this.base_json = result);
  }

  fields() {
    return this.base_json.meta.fields;
  }

  rows() {
    return this.base_json.data;
  }

  // This method converts base_json into a json file with YNAB specific fields based on
  //   which fields you choose in the dropdowns in the browser.

  // --- parameters ----
  // limit: expects an integer and limits how many rows get parsed (specifically for preview)
  //     pass in false or null to do all.
  // lookup: hash definition of YNAB column names to selected base column names. Lets us
  //     convert the uploaded CSV file into the columns that YNAB expects.
  // inverted_outflow: if true, positive values represent outflow while negative values represent inflow
  // normalize_date: false leaves date as is, true outputs it as YYYY-MM-DD
  converted_json(limit, ynab_cols, lookup, inverted_outflow = false, normalize_date = false) {
    var value;
    if (this.base_json === null) {
      return null;
    }
    value = [];
    // TODO: You might want to check for errors. Papaparse has an errors field.
    if (this.base_json.data) {
      this.base_json.data.forEach(function (row, index) {
        var tmp_row;
        if (!limit || index < limit) {
          tmp_row = {};
          ynab_cols.forEach(function (col) {
            var cell;
            cell = row[lookup[col]];
            // Some YNAB columns need special formatting,
            //   the rest are just returned as they are.
            if (cell) {
              switch (col) {
                case "Outflow":

                  if (lookup['Outflow'] == lookup['Inflow']) {
                    if (!inverted_outflow) {
                      tmp_row[col] = cell.startsWith('-') ? cell.slice(1) : "";
                    } else {
                      tmp_row[col] = cell.startsWith('-') ? "" : cell;
                    }
                  } else {
                    tmp_row[col] = cell.startsWith('-') ? cell.slice(1) : cell;
                  }
                  break;
                case "Inflow":
                  if (lookup['Outflow'] == lookup['Inflow']) {
                    if (!inverted_outflow) {
                      tmp_row[col] = cell.startsWith('-') ? "" : cell;
                    } else {
                      tmp_row[col] = cell.startsWith('-') ? cell.slice(1) : "";
                    }
                  } else {
                    tmp_row[col] = cell;
                  }
                  break;
                case "Date":
                  if (normalize_date) {
                    // Venmo outputs e.g. 2020-11-30T17:07:16
                    // As of late 2020, if hyphens are the separators, YNAB takes it as YYYY-MM-DD
                    if (cell.indexOf("T") >= 0)
                      tmp_row[col] = cell.substr(0, cell.indexOf("T"))
                  } else {
                    tmp_row[col] = cell;
                  }
                  break;
                default:
                  tmp_row[col] = cell;
              }
            }
          });
          value.push(tmp_row);
        }
      });
    }
    return value;
  }

  converted_csv(limit, ynab_cols, lookup, inverted_outflow, normalize_date) {
    var string;
    if (this.base_json === null) {
      return nil;
    }
    // Papa.unparse string
    string = '"' + ynab_cols.join('","') + '"\n';
    this.converted_json(limit, ynab_cols, lookup, inverted_outflow, normalize_date).forEach(function (row) {
      var row_values;
      row_values = [];
      ynab_cols.forEach(function (col) {
        var row_value;
        row_value = row[col] || "";
        // escape text which might already have a quote in it
        row_value = row_value.replace(/"/g, '""').trim();
        return row_values.push(row_value);
      });
      return (string += '"' + row_values.join('","') + '"\n');
    });
    return string;
  }
};
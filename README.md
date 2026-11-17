# ynab-csv


Tool for making your CSV files ready to import into YNAB.

http://aniav.github.io/ynab-csv/


## How to Use

1. Visit the link above.
2. Drop or select the the csv file you want to make ready for YNAB.
3. For each column in the YNAB data file, choose which column you want to pull from your source data file.
4. Save the new YNAB file and you are ready to import that right into YNAB!

## Multiple Profiles

`ynab-csv` stores your settings in the browser under a profile named `default`. Each time you change your column mapping or other
settings, the new settings will be saved.

A new profile can be created by adding `?profile=<profile name>` to the link above. For example, `?profile=paypal` would create a
new profile named `paypal`. Then, column mappings will be saved to that profile instead.

You can switch between profiles by selecting the profile from the dropdown or by typing `?profile=<profile name>` directly in
the browser address bar.

## Running Locally

To run the project locally using Docker Compose:

1. Clone this repository: `git clone https://github.com/aniav/ynab-csv.git`
2. Navigate to the cloned directory: `cd ynab-csv`
3. Run: `docker compose up -d`
4. Open your web browser and navigate to http://localhost:3000 (set `PORT` in `.env` to use a different port)

## Privacy

Your data never leaves your computer. All the processing happens locally.


## Reporting Issues

If you have any other issues or suggestions, go to https://github.com/aniav/ynab-csv/issues and create an issue if one doesn't already exist. If the issue has to do with your csv file, please create a new gist (https://gist.github.com/) with the content of the CSV file and share the link in the issue. If you tweak the CSV file before sharing, just make sure whatever version you end up sharing still causes the problem you describe.

## Contribute

The app is a static page (Alpine.js, Bootstrap and PapaParse loaded from a CDN) with no build step. You need [Node.js](https://nodejs.org/) 26 (see `.node-version`) for the dev server and tests.

1. Fork and clone the project
2. `cd` into the project
3. Run `npm install`
4. Run `npm start` to serve the app at http://localhost:3000
5. Make your changes and run `npm test` (unit tests plus full-page tests that load `index.html` in jsdom)
6. Commit those changes and push to your forked repository
7. Make a new pull request

When updating a library loaded from the CDN in `index.html`, update the matching pinned version in `package.json` and its `integrity` hash too; `npm test` checks that they match.

const fs = require('fs');
const path = require('path');

const targetFiles = [
  path.join(__dirname, '..', 'data', 'content.json'),
  path.join(__dirname, '..', 'public', 'seed-content.json'),
  path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'assets', 'public', 'seed-content.json')
];

const newSeries = JSON.parse(fs.readFileSync(path.join(__dirname, '7_first_kisses.json'), 'utf8'));

// Ensure genre is set accurately
newSeries.genre = "Romance, Comedy";

targetFiles.forEach(filePath => {
  if (!fs.existsSync(filePath)) {
    console.warn(`File does not exist: ${filePath}`);
    return;
  }

  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  
  if (!data.series) {
    data.series = [];
  }

  // Check if series already exists
  const existingIdx = data.series.findIndex(s => s.id === newSeries.id || s.title === newSeries.title);
  if (existingIdx !== -1) {
    console.log(`Updating existing entry at index ${existingIdx} in ${filePath}`);
    data.series[existingIdx] = newSeries;
  } else {
    console.log(`Prepending new series to ${filePath}`);
    data.series.unshift(newSeries);
  }

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
  console.log(`Successfully updated ${filePath}`);
});

console.log('All files updated successfully!');

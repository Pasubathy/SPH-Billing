const https = require('https');

https.get('https://registry.npmjs.org/@google/generative-ai/latest', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const json = JSON.parse(data);
    console.log("Latest version:", json.version);
  });
}).on('error', err => {
  console.log('Error: ', err.message);
});

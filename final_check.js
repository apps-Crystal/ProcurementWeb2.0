
const { google } = require("googleapis");

const SPREADSHEET_ID = "1Pb_cGQQYSRQW1IpMEGX2rW2VGyoZAh794g41z-h5YIo";
const CLIENT_EMAIL = "procurement2-0@procurement2.iam.gserviceaccount.com";
const PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDRTvD1nedf5W0p\nLi7auIziHZ5boMhG6anHhcub0WXTL7b7EgWzZFGNN/gaEV/+ZOyhdSS2oASFXnvQ\n2cYtNb29kPFsolFW1p6d1SCsGlZto9nc9FHVFftexJYLrMqRU/gX9ucP53YB0d+P\nhD8hnBRrM8izmJyl5zvyQ4QYsF+Fd8/hxu330ij14QFgImcgKHyXjAXSQtxu2VIj\naUT6Grwi34rl8tFE0qUYhkTmI1215gYMXXGKwcuPRuM7G/3TH+Dl3W1krh15fDk6\nXY+fMY2/5vN9/K4G7vDZW22e+15PLaMRLylQDRiZwJpXCgU4mJRmPi6asS/Oxmi6\nsjpBUHkVAgMBAAECggEADw754QHiQpD0AJF1B4FdiWsOGJOBtTBcaaFjm6s+Ayqc\npIWQaW6fO2S6cc2sNVY3fAo8gPMUQDAjAkyYqGoEY54I8ILhDTlVog9SUW93pl2y\nb+YX+ReixRepn99nl3sOD1NRHmDNqaXayq1+CUH8ahYIq3sgUgNH2c8nsssFpElw\nC0UajUvVHQ589V2iwFdFmJaXeBRzYQ0DuQS1BwwO8oECMjhtbFk0wulYGci2EgYn\noWYW8fuUcl2U0fGoaQxG8QQ28GJuGLOp8gg39bor3+2KjqvhFnuEBlaycfXqLI4v\nUbljPfVpAqShly8JdEoUxUJ5xT/NCzwKwVS9jZKXwQKBgQD1RKs/SAob5V8CGLiN\nV/ilcIR6PNqv/ByHQDmm2qqgnh2U+9uyQgnMMI/tvX+lQlEoiJ/NKz5pkCtloN9z\nKk5GKBb8Qv8vonkjx80p0wbukhRZi+909+8e1QA1kEMYoibF1xhrDdI37+Afwby/\n3ha3Io9uW7pdr7dF2s+aqm6EBQKBgQDad3lL2TAA2qtCqq+4xaI+NirjV4PkspEY\n9ip1CPSIZ0cpe2dVexFTK+8Cj3vuKdZBR0WF9s3n/8Hk5aBDD4HYkTDOz9dMXCfq\nMOmooyqynHPwbPON9L38zyma8mmlX0HVyyBNCQWrnVqvCsMAb4tqvPa+hgFIpRu7\nsbUvWFO90QKBgG+cWw1F/AuruitbEoiHcsfeRvrVPHL/GABYMqQCN8k1iqKkZdpd\ngNXhd22pYS/T2NjIK2gS+KjTCVyK84QVyV7VmXgcCMIlfljQ8ETLGglwgkAplMM2\nnCL8rMazKkVIbLp04lC9Dl+UEfqBkCIDr3SRDpIavdkqQA1SwExSqE39AoGBAMxX\nvAkKGTBzWIV/CeYWVe9C01LaZO/hZn6moofd3HxJvfI7DyiReF8HVQRcGVtnnpRo\nicsIUwiR3Vawwfp34sgi5jhLh+JQwLT5E1U9aY6vcHKONjGtnpd9XjkkTVT1iKrk\n2E22BqvC/zODKWqa6xjnrxP+W+0LIqmpSwQB5jJBAoGBAMFH+N0jfPJcDQJd4hBc\nLZ/Ljp2LnWAJecyALxOskIRuHo03DwOh2mEajRj3hXjaWU0eCur9IeJDAl9y8/dX\nK7ORb9JEqXcwpeedMMJZ+AO95PG7eDQfhwIHbII4SSUkyzHewBe3FlIYrNidhKNL\nHZaXeHfxYROLAyLxaXPJ13JB\n-----END PRIVATE KEY-----`;

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: CLIENT_EMAIL,
    private_key: PRIVATE_KEY.replace(/\\n/g, "\n"),
  },
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const sheets = google.sheets({ version: "v4", auth });

async function check() {
  try {
    const res = await sheets.spreadsheets.get({
      spreadsheetId: SPREADSHEET_ID,
    });
    const titles = res.data.sheets.map(s => s.properties.title);
    console.log("SHEET_TITLES=" + JSON.stringify(titles));
  } catch (e) {
    console.log("ERROR=" + e.message);
  }
}

check();

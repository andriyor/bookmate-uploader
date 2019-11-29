const fs = require("fs");

const puppeteer = require('puppeteer-core');
const { getPlatform } = require('chrome-launcher/dist/utils.js');
const chromeFinder = require('chrome-launcher/dist/chrome-finder.js');
const readdirp = require("readdirp");
const _ = require("lodash");

const CREDS = require('./creds');

(async ()  => {
  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || (await(chromeFinder)[getPlatform()]())[0];
  if (!executablePath) {
    throw new Error('Chromium based browser is not installed.');
  }

  const browser = await puppeteer.launch({ executablePath, headless: false });
  const page = await browser.newPage();

  await page.setViewport({ width: 1240, height: 680 });
  await page.setRequestInterception(true);

  page.on("request", interceptedRequest => {
    if (interceptedRequest.url().includes("mail.ru")) {
      console.log(interceptedRequest.url());
      interceptedRequest.abort();
    } else interceptedRequest.continue();
  });

  try {
    data = fs.readFileSync("cookies.json", "utf8");
    let cookies = JSON.parse(data);
    page.setCookie(...cookies);
    console.log("using saved cookies");

    await page.goto("https://bookmate.com", {
      waitUntil: ["domcontentloaded"]
    });
  } catch (err) {
    if (err.code === "ENOENT") {
      console.log("cookies not found!");

      await page.goto("https://bookmate.com");

      const LOGIN_SELECTOR = "#login-button";
      const EMAIL_SELECTOR = "#auth-with-email";

      await page.click(LOGIN_SELECTOR);
      await page.waitForSelector(EMAIL_SELECTOR);
      await page.click(EMAIL_SELECTOR);

      const USERNAME_SELECTOR = ".credential-input input";
      const PASSWORD_SELECTOR = ".login-form input[type=password]";
      const BLOGIN_SELECTOR = ".login-form button";

      await page.waitForSelector(USERNAME_SELECTOR);

      await page.click(USERNAME_SELECTOR);
      await page.keyboard.type(CREDS.username);

      await page.click(PASSWORD_SELECTOR);
      await page.keyboard.type(CREDS.password);

      await page.click(BLOGIN_SELECTOR);
      await page.waitForSelector('.promo-three-months__button');

      let cookies = await page.cookies("https://bookmate.com");
      let data = JSON.stringify(cookies);

      await fs.writeFile("cookies.json", data, "utf8", err => {
        if (err) throw err;
        console.log("The file has been saved!");
      });

    } else {
      throw err;
    }
  }

  const UPLOAD = 'a[href="/upload"]';
  const TO_ME = "label[for=public_1]";

  const startUploads = async params => {
    await page.click(UPLOAD);
    const inputElement = await page.$("div .upload-drop-zone__file-input");

    for (const path of params) {
      await inputElement.uploadFile(path);
      await page.click(TO_ME);
    }
    await page.click(".upload-button button");
    await page.waitForSelector(".user-section-navigation-wrapper");
  };

  let books = [];
  readdirp({
    root: ".",
    directoryFilter: ["!.git", "!*modules"],
    fileFilter: ["*.epub", "*.fb2"]
  })
    .on("data", entry => {
      books.push(entry.path);
    })
    .on("end", async () => {
      books = _.chunk(books, [(size = 3)]);
      for (const five_books of books) {
        await startUploads(five_books);
      }
    });

  // await page.screenshot({ path: "bookmate_wait.png" });

  await browser.close();
})();

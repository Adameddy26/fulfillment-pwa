const { test, expect, chromium} = require('@playwright/test');
test ('Launchpad', async () => {
  test.setTimeout(50000);

  //Set up the environment
  const browser = await chromium.launch(); 
  const context = await browser.newContext({headless: false, viewport: { width: 1400, height: 700 }}); // launch the browser in a visible window and set the visible portion of the web page within the browser window.
  const page = await context.newPage();
  
  // try-catch block for error handling
  try {
    
    // Go to URL and verify the heading
    await page.goto("https://launchpad.hotwax.io");
    expect(await page.textContent('h1')).toContain('Launch Pad');
    await page.waitForTimeout(2000);

    // Count the number of Apps on Launchpad
    const elementSelector = '.app.md.ion-activatable'; 
    const cardCounts = await page.$$(elementSelector); // get all elements matching elementSelector
    const apps = cardCounts.length;
    console.log(`Found ${apps} Apps on Launchpad`);

    // Print the App title and verify the number of environment options present on each App card
    for (let count = 1; count <= apps; count++) {
      const element = cardCounts[count-1]; 
      const title = await element.textContent();
      if (title) {
        console.log(`Card ${count}: ${title}`);
      } else {
        console.log(`No title present for Card ${count}`);
      }
      const devuat = await element.$$('.in-buttons.button-has-icon-only.ion-activatable.ion-focusable');
      const prod = await element.$$('.app-icon.ion-padding');
      const environments = devuat.length + prod.length;
      if (environments !== 3) {
        throw new Error(`Expected exactly 3 environments for this App, found ${environments.length}`);
      }
      else{
        console.log(`Found 3 environments for ${title} App!`);
      }
    }
    
    // Login with user credentials
    await page.click('text=Login');
    await page.waitForTimeout(2000);
    await page.fill('input[name="instanceUrl"]', process.env.INSTANCE);
    const enteredValue = await page.$eval('input[name="instanceUrl"]', el => el.value); // retrives the value attribute of the input element with name="instanceUrl
    await page.waitForTimeout(2000);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2000);
    await page.locator('input[name="username"]').fill(process.env.USERNAME);
    await page.locator('input[name="password"]').fill(process.env.PASSWORD);
    await page.waitForTimeout(2000);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2000);

    // Validate the visibility of username and OMS instance
    const username = await page.locator('ion-item.item-has-start-slot.item.md.item-lines-full.item-fill-none.in-list.ion-focusable');
    if (username) {
      const usernameText = await username.evaluate(element => {
        return element.childNodes[1].textContent.trim();  // logic to get the text content of the second child node within the element and trims any whitespaces
      });
      if (usernameText) {
        console.log(usernameText);
      } else {
        console.log('Error : Username not found ')
      }
    }
    const instanceName = await page.locator('.sc-ion-label-md-s.md').textContent();
    await expect(instanceName).toContain(enteredValue);
    await page.waitForTimeout(2000);

    // Verify the OMS link 
    const newTabPopup = page.waitForEvent('popup');
    await page.locator('.md.button.button-small.button-clear.button-has-icon-only.ion-activatable.ion-focusable').click();
    const newTab = await newTabPopup;
    await newTab.waitForLoadState(); // wait till new tab is ready with its content
    const newTabUrl = await newTab.url(); 
    await expect(newTabUrl).toContain('https://dev-oms.hotwax.io/commerce/control/main?token=');
    await page.waitForTimeout(2000);
    await newTab.close();
    await page.waitForTimeout(3000);

    // Logout the Launchpad
    const linkLocator= page.getByRole('button', { name: 'Logout' });
    await linkLocator.click();
    await page.waitForTimeout(3000);
  }
  catch (error) {

    // Log the error for debugging  
    console.error('Error:', error);  
  }
  await page.close();
  await browser.close();
});

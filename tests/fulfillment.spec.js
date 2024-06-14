const { test, expect, chromium } = require('@playwright/test');
test('Fulfillment', async () => {
  test.setTimeout(8000000);   // Setting a long timeout to handle long test runs
  const browser = await chromium.launch({headless:true});
  const context = await browser.newContext({recordVideo: {dir: 'videos/'}});
  const page = await context.newPage();
  await page.setViewportSize({
  width: 1350,
  height: 650,
});
  // Function to login to launchpad
  async function launchpadLogin() {
    await page.goto("https://launchpad.hotwax.io");
    await page.waitForTimeout(2000);
    const loginButton = '.ion-color.ion-color-danger.md.button.button-outline.ion-activatable.ion-focusable';
    if ((await page.isVisible(loginButton)) && (await page.isEnabled(loginButton))) await page.click(loginButton);
    await page.waitForTimeout(2000);
    await page.fill('input[name="instanceUrl"]', process.env.INSTANCE);
    await page.waitForTimeout(2000);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2000);
    await page.fill('input[name="username"]', process.env.USERNAME);
    await page.fill('input[name="password"]', process.env.PASSWORD);
    await page.waitForTimeout(2000);
    await page.keyboard.press('Enter');
    await page.waitForSelector('#app > ion-app > ion-router-outlet > div:nth-child(1) > ion-content > main', {visible:true, timeout:10000});
  }

  // Function to get user details
  async function getUserDetails(selectors) {
    return {
      username: await page.textContent(selectors.usernameElement),
      instance: await page.textContent(selectors.instanceElement),
      appVersion: await page.textContent(selectors.appVersionElement),
      buildDateTime: await page.textContent(selectors.buildDateTimeElement),
    };
  }

  // Function to handle order flow retry mechanism
  async function orderFlowRetry() {
    try {
      await page.waitForTimeout(2000);
      if (await page.isVisible('.md.chip-outline.ion-activatable')) { 
        await orderDetails();
        await checkOrderFilters();
        const result = await pickPackShipOrder();
        if (result === false) {
          console.log("Failed to pick, pack, or ship order.");
          return false;
        }
      }
      return true;
    } catch (e) {
      // Capture and save the screenshot in case of error
        const timestamp = new Date().toISOString().replace(/:/g, '-');
        await page.screenshot({ path: `error-screenshot-${timestamp}.png` });
        console.error('Error:', e);
        return false;
      }
  }

  // Function to fetch and verify order details
  async function orderDetails() {
    const metadata = await page.textContent('#view-size-selector > div > div.results > ion-card:nth-child(2) > div.order-header > div.order-metadata');
    const orderPrimaryInfo = await page.textContent('#view-size-selector > div > div.results > ion-card:nth-child(2) > div.order-header > div.order-primary-info');
    const orderId = await page.textContent('#view-size-selector > div > div.results > ion-card:nth-child(2) > div.order-header > div.order-tags > ion-chip > ion-label');
    await page.locator('.md.chip-outline.ion-activatable').first().click();
    await page.waitForSelector('.popover-viewport', {visible:true, timeout:10000});
    await page.waitForTimeout(1000);
    await page.locator('ion-item:has-text("View details")').click();
    await page.waitForSelector('.ion-page.can-go-back', {visible:true, timeout:10000});
    expect(await page.textContent('#main-content > div.ion-page.can-go-back > ion-content > div > div.order-header > div.order-metadata > ion-badge')).toBe("Open");
    expect(await page.textContent('#view-size-selector > div > div.results > ion-card:nth-child(2) > div.order-header > div.order-metadata')).toBe(metadata);
    expect(await page.textContent('#main-content > div.ion-page.can-go-back > ion-content > div > ion-card > div.order-header > div.order-primary-info')).toBe(orderPrimaryInfo);
    expect(await page.textContent('#main-content > div.ion-page.can-go-back > ion-content > div > div.order-header > div.order-primary-info')).toBe(orderId);
    await page.waitForTimeout(2000);
    await page.click('.md.button.back-button-has-icon-only.in-toolbar.ion-activatable.ion-focusable.show-back-button');
    await page.waitForTimeout(2000);
  }

  // Function to apply order filters and validate the number of orders being fetched
  async function checkOrderFilters() {
    const orderCount = await page.locator('#main-content > div > ion-header > ion-toolbar > ion-title');
    const numberOfOrders = await orderCount.evaluate(element => element.childNodes[0].textContent.split(' ')[0]);
    const totalNumberOfOrders = await orderCount.evaluate(element => element.childNodes[0].textContent.split(' ')[2]);
    let orderCards = await page.$$('.md.chip-outline.ion-activatable');
    if (Number(totalNumberOfOrders) >= 11) {
      let previousOrderCount = 0;
      let previousLastOrderItemsCount = 0;
      let filterOptionText = 0;
      await page.locator('ion-buttons.buttons-last-slot.sc-ion-buttons-md-h.sc-ion-buttons-md-s.md ion-menu-button').click();
      await page.waitForSelector('div.ion-page div.menu-inner', {visible:true, timeout:10000});
      const matchOrderNumber = await page.$eval('.radio-checked', element => element.textContent.split(' ')[0]);
      expect(Number(numberOfOrders)).toBe(Number(matchOrderNumber));
      await page.waitForTimeout(2000);
      const orderFilterOptions = await page.$$('.md.in-item.radio-justify-start.radio-alignment-center.radio-label-placement-end:not(.radio-checked)');
      const randomOption = orderFilterOptions[Math.floor(Math.random() * orderFilterOptions.length)];
      filterOptionText = await randomOption.textContent();
      await randomOption.click();
      await page.click('.ion-color.ion-color-light.md.item');
      await page.waitForTimeout(2000);
      while (true) {
        // Flow to scroll down the page till the last item present for last order being fetched
        const orderCards = await page.$$('.md.order');
        const currentOrderCount = orderCards.length;
        if (currentOrderCount === previousOrderCount) break;
        const lastOrderCard = orderCards[currentOrderCount - 1];
        await lastOrderCard.scrollIntoViewIfNeeded();
        await page.waitForTimeout(2000);
        previousOrderCount = currentOrderCount;
        while (true) {
          const lastOrderItems = await lastOrderCard.$$('.order-item');
          const lastOrderItemsCount = lastOrderItems.length;
          if (lastOrderItemsCount === previousLastOrderItemsCount) break;
          const lastOrderItem = lastOrderItems[lastOrderItemsCount - 1];
          await lastOrderItem.scrollIntoViewIfNeeded();
          await page.waitForTimeout(2000);
          previousLastOrderItemsCount = lastOrderItemsCount;
        }
      }
      orderCards = await page.$$('.md.chip-outline.ion-activatable');
      expect (filterOptionText).toContain(orderCards.length.toString());
    } 
    else {
      expect (Number(numberOfOrders)).toBe(orderCards.length);
    }
    console.log(`Total order cards loaded: ${orderCards.length}`);
  }

  // Function to pick, pack and ship the order
  async function pickPackShipOrder() {
    await page.locator('.md.chip-outline.ion-activatable').first().click();
    await page.waitForSelector('.popover-viewport', {visible:true, timeout:10000});
    await page.waitForTimeout(2000);
    await page.locator('ion-item:has-text("Pick order")').click();
    console.log('a');
    await page.waitForTimeout(4000);
    await page.locator('ion-item:has-text("Copy ID")').click();
    await page.waitForTimeout(2000);
    console.log('b');
    await page.waitForSelector('.item.md.item-lines-default.item-fill-none.item-has-interactive-control.in-list.ion-activatable.ion-focusable.item-label', {visible:true, timeout:10000});
    const pickerList = await page.$$('.item.md.item-lines-default.item-fill-none.item-has-interactive-control.in-list.ion-activatable.ion-focusable.item-label');
    if (pickerList.length == 0){
      console.error("No picker found in picklist");
      console.log('c');
      const crossButton = '.md.button.button-clear.in-toolbar.in-buttons.button-has-icon-only.ion-activatable.ion-focusable';
      if ((await page.isVisible(crossButton)) && (await page.isEnabled(crossButton))) await page.click(crossButton);
      await page.waitForTimeout(2000);
      await packShip();
    }
    const randomPicker = pickerList[Math.floor(Math.random() * pickerList.length)];
    await randomPicker.click();
    await page.waitForTimeout(2000);
    console.log('d');
    const ionFabButton = 'ion-modal > div > ion-fab > ion-fab-button';
    if (await page.isDisabled(ionFabButton)) {
      console.log('Picklist not saved');
    } 
    else {
      console.log('e');
      await page.click(ionFabButton);
    }
    await newTab();
    await page.waitForTimeout(2000);
    await page.locator('ion-label:has-text("In Progress")').click();
    await page.waitForTimeout(2000);
    console.log('g');
    await page.locator('.searchbar-input.sc-ion-searchbar-md').click();
    await page.keyboard.press('Control+V');
    await page.keyboard.press('Enter');
    console.log('h');
    await page.waitForTimeout(4000);
    await packShipButton();
    await page.waitForSelector('.alert-wrapper.ion-overlay-wrapper.sc-ion-alert-md', {visible:true, timeout:10000});
    await page.waitForTimeout(2000);
    await page.locator('.alert-tappable.alert-checkbox.alert-checkbox-button.ion-focusable.sc-ion-alert-md').nth(0).click();
    await page.waitForTimeout(1000);
    await page.locator('.alert-tappable.alert-checkbox.alert-checkbox-button.ion-focusable.sc-ion-alert-md').nth(1).click();
    await page.waitForTimeout(2000);
    await page.locator('.alert-button.ion-focusable.ion-activatable.alert-button-role-confirm.sc-ion-alert-md').click();
    await newTab();
    await page.waitForTimeout(2000);
    await page.locator('ion-label:has-text("Completed")').click();
    await page.waitForTimeout(3000);
    await page.locator('.searchbar-input.sc-ion-searchbar-md').click();
    await page.keyboard.press('Control+V');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(3000);
    return await packShipButton();
  }

  // Function to open a new tab when a picklist, packing slip or shipping label is generated
  async function newTab() {
    const newTabPopup = page.waitForEvent('popup');
    const newTab = await newTabPopup;
    console.log('f');
    await newTab.waitForLoadState();
    console.log('i');
    await newTab.close();
  }

  // Function to pack and ship the order incase there is no picker present in the picklist
  async function packShip() {
    await page.waitForTimeout(2000);
    await page.locator('ion-label:has-text("In Progress")').click();
    await page.waitForTimeout(2000);
    await page.locator('.searchbar-input.sc-ion-searchbar-md').click();
    await page.keyboard.press('Control+V');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(4000);
    await packShipButton();
    await page.waitForSelector('.alert-wrapper.ion-overlay-wrapper.sc-ion-alert-md', {visible:true, timeout:10000});
    await page.waitForTimeout(2000);
    await page.locator('.alert-tappable.alert-checkbox.alert-checkbox-button.ion-focusable.sc-ion-alert-md').nth(0).click();
    await page.waitForTimeout(1000);
    await page.locator('.alert-tappable.alert-checkbox.alert-checkbox-button.ion-focusable.sc-ion-alert-md').nth(1).click();
    await page.waitForTimeout(2000);
    await page.locator('.alert-button.ion-focusable.ion-activatable.alert-button-role-confirm.sc-ion-alert-md').click();
    await newTab();
    await page.waitForTimeout(2000);
    await page.locator('ion-label:has-text("Completed")').click();
    await page.waitForTimeout(3000);
    await page.locator('.searchbar-input.sc-ion-searchbar-md').click();
    await page.keyboard.press('Control+V');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(3000);
    return await packShipButton();
  }

  // Function to click the pack/ship button
  async function packShipButton() {
    if (await page.isVisible('.md.button.button-solid.ion-activatable.ion-focusable')) {
      await page.click('.md.button.button-solid.ion-activatable.ion-focusable');
      console.log('pack/ship button clicked');
      await page.waitForTimeout(3000);
      return true;
    } else {
      console.log('order not found');
      return false;
    }
  }

  // Function to change the facility after each orderflow or incase no orders are present in open state for a facility 
  async function changeFacility() {
    await page.locator('ion-label:has-text("Settings")').click();
    await page.waitForTimeout(2000);
    await page.locator('#main-content > div > ion-content > section:nth-child(3) > ion-card:nth-child(3) > ion-item').click();
    await page.waitForSelector('.popover-viewport', {visible:true, timeout:10000});
    await page.waitForTimeout(2000);
  }

  try {
    await launchpadLogin();
    await page.locator('ion-card:has-text("Fulfillment")').locator('.ion-color.ion-color-medium.md.button.button-clear.in-buttons.button-has-icon-only.ion-activatable.ion-focusable').nth(1).click();
    await page.waitForSelector('.split-pane-side.md.menu-type-overlay.menu-side-start.menu-pane-visible.menu-enabled', {visible:true, timeout:10000});
    await page.waitForTimeout(2000);
    await page.locator('ion-label:has-text("Settings")').click();
    await page.waitForSelector('.user-profile', {visible:true, timeout:10000});
    await page.waitForTimeout(2000);

    const selectors = {
      usernameElement: 'div.user-profile ion-card-subtitle',
      instanceElement: '#main-content > div > ion-content > section:nth-child(3) > ion-card:nth-child(1) > ion-card-header > ion-card-title',
      appVersionElement: '.section-header div p.overline:nth-child(2)',
      buildDateTimeElement: '.section-header div p.overline:nth-child(1)'
    };
    const { username, instance, appVersion, buildDateTime } = await getUserDetails(selectors);
    expect(username).toContain(process.env.USERNAME);
    expect(instance).toContain(process.env.INSTANCE);

    await page.locator('#main-content > div > ion-content > section:nth-child(3) > ion-card:nth-child(3) > ion-item').click();
    await page.waitForSelector('.popover-viewport', {visible:true, timeout:10000});
    let dropdownItems = await page.$$('.select-interface-option.md.sc-ion-select-popover-md.item.item-lines-default.item-fill-none.item-has-interactive-control.ion-activatable.ion-focusable');
    console.log(`${dropdownItems.length} facilities found`);

    let facilityRunCount = 0;
    for (let i = 12; i < dropdownItems.length && facilityRunCount < 3; i++) {
      await dropdownItems[i].scrollIntoViewIfNeeded();
      const facilityName = await dropdownItems[i].textContent();
      await dropdownItems[i].click();
      await page.waitForTimeout(3000);
      const matchFacility = await page.locator('ion-menu ion-header ion-title').textContent();
      if (matchFacility === facilityName) {
        let flowCompleted = false;
        while(!flowCompleted) {
          //Give a retry incase an error occurs in the order flow
          const cancelButton = 'button:has-text("Cancel")';
          if ((await page.isVisible(cancelButton)) && (await page.isEnabled(cancelButton))) await page.click(cancelButton);
          const crossButton = '.md.button.button-clear.in-toolbar.in-buttons.button-has-icon-only.ion-activatable.ion-focusable';
          if ((await page.isVisible(crossButton)) && (await page.isEnabled(crossButton))) await page.click(crossButton);
          await page.waitForTimeout(2000);
          await page.locator('ion-label:has-text("Open")').click();
          flowCompleted = await orderFlowRetry();
        }
        if (flowCompleted) {
          // If the full flow is completed then increase the facilityRunCount and change the facility or else change the facility.
          if (!(await page.isVisible('.md.chip-outline.ion-activatable'))) { 
            await page.waitForSelector('.buttons-last-slot.sc-ion-buttons-md-h.sc-ion-buttons-md-s.md', {visible:true, timeout:10000});
            const button1 = '.ion-color.ion-color-danger.md.button.button-clear.in-toolbar.in-buttons.button-disabled.ion-activatable.ion-focusable';
            const button2 = '.md.button.menu-button-disabled.in-toolbar.ion-activatable.ion-focusable';
            if ((!await page.isEnabled(button1)) && (!await page.isEnabled(button2))){
              if (i==dropdownItems.length-1) {
                break;
              }
            }
            else {
              await changeFacility();
            }
          }
          else {
            facilityRunCount++;
            if (facilityRunCount==3) break;
            await changeFacility();
          } 
        }
      } 
      else {
        console.log('Facility names do not match');
        await changeFacility();
      }
      dropdownItems = await page.$$('.select-interface-option.md.sc-ion-select-popover-md.item.item-lines-default.item-fill-none.item-has-interactive-control.ion-activatable.ion-focusable');
    }
    console.log(appVersion);
    console.log(buildDateTime);
    await page.waitForTimeout(3000);
  } 
  catch (error) {
    const timestamp = new Date().toISOString().replace(/:/g, '-');
    await page.screenshot({path: `error-screenshot-${timestamp}.png`});
    console.error('Error:', error);
  }
  finally {
    await page.close();
    await browser.close();
  }
});

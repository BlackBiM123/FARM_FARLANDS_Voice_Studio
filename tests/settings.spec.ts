import { test, expect } from '@playwright/test';
test('settings isolates user administration and voice rule stays in audio pages', async ({page}) => {
 await page.route('**/api/session',r=>r.fulfill({json:{authenticated:true,user:{id:'admin',username:'admin',role:'admin'}}}));
 await page.route('**/api/cloud',r=>r.fulfill({json:{configured:false}}));
 await page.route('**/api/users',r=>r.fulfill({json:{users:[]}}));
 await page.goto('/#/settings');
 await expect(page.getByRole('heading',{name:'Пользователи студии'})).toBeVisible();
 await expect(page.locator('.game-style')).toHaveCount(0);
 await expect(page.locator('.casting')).toHaveCount(0);
 for(const route of ['families','characters','stories']) {
  await page.goto('/#/'+route);
  await expect(page.getByRole('heading',{name:'Пользователи студии'})).toHaveCount(0);
  await expect(page.locator('.game-style')).toHaveCount(0);
 }
 await page.getByRole('button',{name:'Студия',exact:true}).click();
 await expect(page.locator('.game-style')).toBeVisible();
 await page.getByRole('button',{name:'Настройки',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Пользователи студии'})).toBeVisible();
});

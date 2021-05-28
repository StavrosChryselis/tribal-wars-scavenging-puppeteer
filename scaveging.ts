import puppeteer from 'puppeteer'
import {Mutex} from 'async-mutex';

const username = ''
const password = ''

let cache:Map<string,{ browser: puppeteer.Browser, page: puppeteer.Page }> = new Map()
const mutex = new Mutex()

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

const sarrwsiUrl = 'https://gr71.fyletikesmaxes.gr/game.php?village=2487&screen=place&mode=scavenge'

type CalculatedResults = {
  spears:number,
  swords:number,
  axes:number,
  light:number,
  heavy:number
}

let scavenge1Army:CalculatedResults|undefined = undefined
let scavenge2Army:CalculatedResults|undefined = undefined
let scavenge3Army:CalculatedResults|undefined = undefined
let scavenge4Army:CalculatedResults|undefined = undefined


async function withMutex<T>(fun:() => Promise<T>):Promise<T> {
  const release = await mutex.acquire()
  try {
    const res = await fun()
    return res
  } finally {
    release()
  }
}

async function catchRetry(str: string, page: puppeteer.Page): Promise<any> {
  try {
    const result = await page.evaluate(str)
    return result
  } catch (err) {
    console.log('retrying')
    console.log(err)
    console.log('err-string',str)
    await delay(1000)
    await catchRetry(str, page)
  }
}

async function logout() {
    if (!cache.has('snowfire'))
    return

  await cache.get('snowfire').page.close()
  await cache.get('snowfire').browser.close()
  cache.delete('snowfire')
}

async function login() {
    if(!cache.has('snowfire')) {
      const browser = await puppeteer.launch({headless:true})
  
      const page = await browser.newPage()
      const navigationPromise = page.waitForNavigation()
  
      await page.goto('https://www.fyletikesmaxes.gr/')
      await navigationPromise
      await page.setViewport({ width: 1920, height: 950 })
  
      await page.waitForSelector('.right #user')
      await page.click('.right #user')
  
      await page.type('.right #user', `${username}`)
  
      await page.waitForSelector('.right #password')
      await page.click('.right #password')
      await page.type('.right #password', `${password}`)
  
      await page.evaluate(`document.getElementsByClassName('btn-login')[0].click()`)
  
      await navigationPromise
  
      await page.waitForSelector('.right > .wrap > .worlds-container > .world-select > .world_button_active')
      await page.click('.right > .wrap > .worlds-container > .world-select > .world_button_active')
  
      cache.set('snowfire',{browser: browser, page: page})
    
    } else {
      const page = cache.get('snowfire').page
      await page.reload()
      const url = page.url()
      if (url === 'https://www.fyletikesmaxes.gr/?session_expired=1') {
        await logout()
        await login()
      }
    }
}

async function checkScaveging1(page:puppeteer.Page):Promise<boolean> {
  try {
    const val = await page.evaluate(`document.getElementsByClassName('options-container')[0].children[0].children[2].children[0].children[1].children[0].textContent`)
    return val === 'Έναρξη'
  } catch {
    return false
  }
}

async function checkScaveging2(page:puppeteer.Page):Promise<boolean> {
  try {
    const val = await page.evaluate(`document.getElementsByClassName('options-container')[0].children[1].children[2].children[0].children[1].children[0].textContent`)
    return val === 'Έναρξη'
  } catch {
    return false
  }
}

async function checkScaveging3(page:puppeteer.Page):Promise<boolean> {
  try {
    const val = await page.evaluate(`document.getElementsByClassName('options-container')[0].children[2].children[2].children[0].children[1].children[0].textContent`)
    return val === 'Έναρξη'
  } catch {
    return false
  }
}

async function checkScaveging4(page:puppeteer.Page):Promise<boolean> {
  try {
    const val = await page.evaluate(`document.getElementsByClassName('options-container')[0].children[3].children[2].children[0].children[1].children[0].textContent`)
    return val === 'Έναρξη'
  } catch {
    return false
  }
}

async function checkScaveging(index:number,page:puppeteer.Page):Promise<boolean> {
  const val = await catchRetry(`document.getElementsByClassName('options-container')[0].children[${index}].children[2].children[0].children[1].children[0].textContent`,page)
  return val === 'Έναρξη'
}

function toMs(str:string):number {
  const hours = Number.parseInt(str.match(/(.*):.*:.*/)[1])
  const minutes = Number.parseInt(str.match(/.*:(.*):.*/)[1])
  const seconds = Number.parseInt(str.match(/.*:.*:(.*)/)[1])

  return seconds * 1000 + minutes * 60 * 1000 + hours * 60 * 60 * 1000 + 1000
}

async function waitForShortest() {
  const page = cache.get('snowfire').page
  const results = [await checkScaveging1(page), await checkScaveging2(page), await checkScaveging3(page), await checkScaveging4(page)]
  const armyNumbers:number[] = await catchRetry(`Array.from(document.getElementsByClassName('units-entry-all squad-village-required')).map(el => Number.parseInt(el.textContent.match(/.(.*)./)[1]))`,page)

  if(results.find(res => res === true) !== undefined && armyNumbers.reduce((prev,curr) => prev+curr,0) > 10) {
      console.log('Found active in wait for shortest')
      await optimal_scaveging()
      return
  }
  let tickers:string[] = await page.evaluate(`Array.from(document.getElementsByClassName('return-countdown')).map(el => el.textContent)`)
  const tickersMs = tickers.map(toMs).sort((a,b) => a-b)
  console.log(`waiting for ${tickersMs[0]} ms`)
  await delay(tickersMs[0] + 2000)
}

async function sendScavenge1(calc_page:puppeteer.Page) {
  console.log('Sending first scavenge')

  if(scavenge1Army === undefined) {
    const spears = await calc_page.evaluate(`document.getElementsByTagName('table')[0].rows[1].cells[2].textContent`).then(Number.parseInt)
    const swords = await calc_page.evaluate(`document.getElementsByTagName('table')[0].rows[2].cells[2].textContent`).then(Number.parseInt)
    const axes = await calc_page.evaluate(`document.getElementsByTagName('table')[0].rows[3].cells[2].textContent`).then(Number.parseInt)
    const light = await calc_page.evaluate(`document.getElementsByTagName('table')[0].rows[5].cells[2].textContent`).then(Number.parseInt)
    const heavy = await calc_page.evaluate(`document.getElementsByTagName('table')[0].rows[7].cells[2].textContent`).then(Number.parseInt)
    scavenge1Army = {spears:spears,swords:swords,axes:axes,light:light,heavy:heavy}
    console.log('Calculated results for scavenge level 1')
    console.log(scavenge1Army)
  } else {
    console.log('Sending scavenge 1 from previous results')
    console.log(scavenge1Army)
  }

  const page = cache.get('snowfire').page

  await page.type('.candidate-squad-widget > tbody > tr > td:nth-child(1) > .unitsInput',scavenge1Army.spears.toString())
  await page.type('.candidate-squad-widget > tbody > tr > td:nth-child(2) > .unitsInput',scavenge1Army.swords.toString())
  await page.type('.candidate-squad-widget > tbody > tr > td:nth-child(3) > .unitsInput',scavenge1Army.axes.toString())
  await page.type('.candidate-squad-widget > tbody > tr > td:nth-child(4) > .unitsInput',scavenge1Army.light.toString())
  await page.type('.candidate-squad-widget > tbody > tr > td:nth-child(5) > .unitsInput',scavenge1Army.heavy.toString())

  await page.evaluate(`document.getElementsByClassName('options-container')[0].children[0].children[2].children[0].children[1].children[0].click()`)
  await delay(2000)
  console.log('completed')
}

async function sendScavenge2(calc_page:puppeteer.Page) {
  console.log('Sending 2 scavenge')

  if(scavenge2Army === undefined) {
    const spears = await calc_page.evaluate(`document.getElementsByTagName('table')[0].rows[1].cells[3].textContent`).then(Number.parseInt)
    const swords = await calc_page.evaluate(`document.getElementsByTagName('table')[0].rows[2].cells[3].textContent`).then(Number.parseInt)
    const axes = await calc_page.evaluate(`document.getElementsByTagName('table')[0].rows[3].cells[3].textContent`).then(Number.parseInt)
    const light = await calc_page.evaluate(`document.getElementsByTagName('table')[0].rows[5].cells[3].textContent`).then(Number.parseInt)
    const heavy = await calc_page.evaluate(`document.getElementsByTagName('table')[0].rows[7].cells[3].textContent`).then(Number.parseInt)
    scavenge2Army = {spears:spears,swords:swords,axes:axes,light:light,heavy:heavy}
    console.log('Calculated results for scavenge level 2')
    console.log(scavenge2Army)
  } else {
    console.log('Sending scavenge 2 from previous results')
    console.log(scavenge2Army)
  }

  const page = cache.get('snowfire').page

  await page.type('.candidate-squad-widget > tbody > tr > td:nth-child(1) > .unitsInput',scavenge2Army.spears.toString())
  await page.type('.candidate-squad-widget > tbody > tr > td:nth-child(2) > .unitsInput',scavenge2Army.swords.toString())
  await page.type('.candidate-squad-widget > tbody > tr > td:nth-child(3) > .unitsInput',scavenge2Army.axes.toString())
  await page.type('.candidate-squad-widget > tbody > tr > td:nth-child(4) > .unitsInput',scavenge2Army.light.toString())
  await page.type('.candidate-squad-widget > tbody > tr > td:nth-child(5) > .unitsInput',scavenge2Army.heavy.toString())

  await page.evaluate(`document.getElementsByClassName('options-container')[0].children[1].children[2].children[0].children[1].children[0].click()`)
  await delay(2000)
  console.log('completed')

}

async function sendScavenge3(calc_page:puppeteer.Page) {
  console.log('Sending 3 scavenge')

  if(scavenge3Army === undefined) {
    const spears = await calc_page.evaluate(`document.getElementsByTagName('table')[0].rows[1].cells[4].textContent`).then(Number.parseInt)
    const swords = await calc_page.evaluate(`document.getElementsByTagName('table')[0].rows[2].cells[4].textContent`).then(Number.parseInt)
    const axes = await calc_page.evaluate(`document.getElementsByTagName('table')[0].rows[3].cells[4].textContent`).then(Number.parseInt)
    const light = await calc_page.evaluate(`document.getElementsByTagName('table')[0].rows[5].cells[4].textContent`).then(Number.parseInt)
    const heavy = await calc_page.evaluate(`document.getElementsByTagName('table')[0].rows[7].cells[4].textContent`).then(Number.parseInt)
    scavenge3Army = {spears:spears,swords:swords,axes:axes,light:light,heavy:heavy}
    console.log('Calculated results for scavenge level 3')
    console.log(scavenge3Army)
  } else {
    console.log('Sending scavenge 3 from previous results')
    console.log(scavenge3Army)
  }

  const page = cache.get('snowfire').page
  
  await page.type('.candidate-squad-widget > tbody > tr > td:nth-child(1) > .unitsInput',scavenge3Army.spears.toString())
  await page.type('.candidate-squad-widget > tbody > tr > td:nth-child(2) > .unitsInput',scavenge3Army.swords.toString())
  await page.type('.candidate-squad-widget > tbody > tr > td:nth-child(3) > .unitsInput',scavenge3Army.axes.toString())
  await page.type('.candidate-squad-widget > tbody > tr > td:nth-child(4) > .unitsInput',scavenge3Army.light.toString())
  await page.type('.candidate-squad-widget > tbody > tr > td:nth-child(5) > .unitsInput',scavenge3Army.heavy.toString())

  await page.evaluate(`document.getElementsByClassName('options-container')[0].children[2].children[2].children[0].children[1].children[0].click()`)
  await delay(2000)
  console.log('completed')

}

async function sendScavenge4(calc_page:puppeteer.Page) {
  console.log('Sending 4 scavenge')

  if(scavenge3Army === undefined) {
    const spears = await calc_page.evaluate(`document.getElementsByTagName('table')[0].rows[1].cells[5].textContent`).then(Number.parseInt)
    const swords = await calc_page.evaluate(`document.getElementsByTagName('table')[0].rows[2].cells[5].textContent`).then(Number.parseInt)
    const axes = await calc_page.evaluate(`document.getElementsByTagName('table')[0].rows[3].cells[5].textContent`).then(Number.parseInt)
    const light = await calc_page.evaluate(`document.getElementsByTagName('table')[0].rows[5].cells[5].textContent`).then(Number.parseInt)
    const heavy = await calc_page.evaluate(`document.getElementsByTagName('table')[0].rows[7].cells[5].textContent`).then(Number.parseInt)
    scavenge4Army = {spears:spears,swords:swords,axes:axes,light:light,heavy:heavy}
    console.log('Calculated results for scavenge level 4')
    console.log(scavenge4Army)
  } else {
    console.log('Sending scavenge 4 from previous results')
    console.log(scavenge4Army)
  }
  
  const page = cache.get('snowfire').page

  await page.type('.candidate-squad-widget > tbody > tr > td:nth-child(1) > .unitsInput',scavenge4Army.spears.toString())
  await page.type('.candidate-squad-widget > tbody > tr > td:nth-child(2) > .unitsInput',scavenge4Army.swords.toString())
  await page.type('.candidate-squad-widget > tbody > tr > td:nth-child(3) > .unitsInput',scavenge4Army.axes.toString())
  await page.type('.candidate-squad-widget > tbody > tr > td:nth-child(4) > .unitsInput',scavenge4Army.light.toString())
  await page.type('.candidate-squad-widget > tbody > tr > td:nth-child(5) > .unitsInput',scavenge4Army.heavy.toString())

  await page.evaluate(`document.getElementsByClassName('options-container')[0].children[3].children[2].children[0].children[1].children[0].click()`)
  await delay(2000)
  console.log('completed')

}

async function optimal_scaveging() {
  await login()
  const page = cache.get('snowfire').page
  await page.goto(sarrwsiUrl)
  const results = [await checkScaveging1(page), await checkScaveging2(page), await checkScaveging3(page), await checkScaveging4(page)]
  if(results.find(res => res === true) === undefined) {
    await waitForShortest()
    return
  }
  const armyNumbers:number[] = await catchRetry(`Array.from(document.getElementsByClassName('units-entry-all squad-village-required')).map(el => Number.parseInt(el.textContent.match(/.(.*)./)[1]))`,page)

  if(armyNumbers.reduce((prev,curr) => prev+curr,0) < 10) {
    await waitForShortest()
    return
  }

  console.log(results)
  console.log(armyNumbers)

  const calc_page = await cache.get('snowfire').browser.newPage()
  await calc_page.goto(`https://daniel.dmvandenberg.nl/scripting-tribal-wars/tribal-wars-scavenge-calculator/`)

  await catchRetry(`document.getElementById('world').selectedIndex=0`,calc_page)

  if(results[0])
    await catchRetry(`document.getElementById('eff').click()`,calc_page)
  if(results[1])
    await catchRetry(`document.getElementById('ebb').click()`,calc_page)
  if(results[2])
    await catchRetry(`document.getElementById('ess').click()`,calc_page)
  if(results[3])
    await catchRetry(`document.getElementById('err').click()`,calc_page)
  
  if(armyNumbers[0] > 0) 
    await catchRetry(`document.getElementById('spear').value=${armyNumbers[0]}`,calc_page)
  if(armyNumbers[1] > 0) 
    await catchRetry(`document.getElementById('sword').value=${armyNumbers[1]}`,calc_page)
  if(armyNumbers[2] > 0) 
    await catchRetry(`document.getElementById('axe').value=${armyNumbers[2]}`,calc_page)
  if(armyNumbers[3] > 0) 
    await catchRetry(`document.getElementById('light').value=${armyNumbers[3]}`,calc_page)
  if(armyNumbers[4] > 0) 
    await catchRetry(`document.getElementById('heavy').value=${armyNumbers[4]}`,calc_page)
  
  await calc_page.evaluate(`fnCalc()`)

  if(results[0])
    await sendScavenge1(calc_page)
  if(results[1])
    await sendScavenge2(calc_page)
  if(results[2])
    await sendScavenge3(calc_page)
  if(results[3])
    await sendScavenge4(calc_page)

  await calc_page.close()
  await delay(1000)
  await waitForShortest()
}

async function run() {
  while(true)
    await optimal_scaveging()
}

run()
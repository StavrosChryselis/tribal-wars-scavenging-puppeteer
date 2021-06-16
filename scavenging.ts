import puppeteer from 'puppeteer'
import * as yargs from 'yargs'
import { Mutex } from 'async-mutex'

const mutex = new Mutex()

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

const generateSarrwsiUrl = (id: number): string => `https://gr71.fyletikesmaxes.gr/game.php?village=${id}&screen=place&mode=scavenge`

type ArmyNumbers = {
  spear: number,
  sword: number,
  axe: number,
  light: number,
  heavy: number
}

type Cache = {
  browser: puppeteer.Browser
  page: puppeteer.Page
}
// let scavengeArmy:ArmyNumbers[] | undefined = undefined
// let customNumbers: [ArmyNumbers,boolean[]] | undefined = undefined

async function catchRetry(str: string, page: puppeteer.Page): Promise<any> {
  try {
    const result = await page.evaluate(str)
    return result
  } catch (err) {
    console.log('retrying')
    console.log(err)
    console.log('err-string', str)
    await delay(1000)
    return await catchRetry(str, page)
  }
}

async function login(username: string, password: string, id: number, cache?: Cache): Promise<Cache> {

  if (cache === undefined) {
    const browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-gpu",
      ]
    })

    const page = await browser.newPage()

    await page.goto('https://www.fyletikesmaxes.gr/')
    await page.setViewport({ width: 1920, height: 950 })

    await page.waitForSelector('.right #user')
    await page.click('.right #user')

    await page.type('.right #user', `${username}`)

    await page.waitForSelector('.right #password')
    await page.click('.right #password')
    await page.type('.right #password', `${password}`)

    await page.evaluate(`document.getElementsByClassName('btn-login')[0].click()`)

    await page.waitForSelector('.right > .wrap > .worlds-container > .world-select > .world_button_active')
    await page.click('.right > .wrap > .worlds-container > .world-select > .world_button_active')

    return { browser: browser, page: page }

  } else {
    const page = cache.page
    await page.reload()
    const url = page.url()
    if (url === 'https://www.fyletikesmaxes.gr/?session_expired=1') {
      await cache.page.close()
      await cache.browser.close()
      return await login(username, password, id)
    }
  }
}

async function checkScaveging(index: number, page: puppeteer.Page): Promise<boolean> {
  try {
    const val = await page.evaluate(`document.getElementsByClassName('options-container')[0].children[${index - 1}].children[2].children[0].children[1].children[0].textContent`)
    return val === 'Έναρξη'
  } catch {
    return false
  }
}

function toMs(str: string): number {
  const hours = Number.parseInt(str.match(/(.*):.*:.*/)[1])
  const minutes = Number.parseInt(str.match(/.*:(.*):.*/)[1])
  const seconds = Number.parseInt(str.match(/.*:.*:(.*)/)[1])

  return seconds * 1000 + minutes * 60 * 1000 + hours * 60 * 60 * 1000 + 1000
}

async function waitForShortest(username:string,password:string,id:number,cache: Cache,customNumbers?:[ArmyNumbers, boolean[]]) {
  const page = cache.page
  const results = await Promise.all([1, 2, 3, 4].map(async i => await checkScaveging(i, page)))
  const armyNumbers: number[] = await catchRetry(`Array.from(document.getElementsByClassName('units-entry-all squad-village-required')).map(el => Number.parseInt(el.textContent.match(/.(.*)./)[1]))`, page)

  if (results.find(res => res === true) !== undefined && armyNumbers.reduce((prev, curr, index) => prev + (curr * ((index < 3) ? 1 : (index === 3) ? 4 : 6)), 0) > 10) {
    console.log('Found available scavenge while waiting for shortest')
    await cache.page.close()
    await cache.browser.close()
    await optimal_scaveging(username,password,id,customNumbers)
    return
  }
  let tickers: string[] = await page.evaluate(`Array.from(document.getElementsByClassName('return-countdown')).map(el => el.textContent)`)
  const tickersMs = tickers.map(toMs).sort((a, b) => a - b)
  console.log(`waiting for ${tickersMs[0]} ms`)
  await delay(tickersMs[0] + 2000)
}

async function sendScavenge(index: number, scavengeArmy: ArmyNumbers[], cache: Cache) {
  console.log(`Sending scavenge ${index}`)

  const page = cache.page

  await page.type('.candidate-squad-widget > tbody > tr > td:nth-child(1) > .unitsInput', scavengeArmy[index - 1].spear.toString())
  await page.type('.candidate-squad-widget > tbody > tr > td:nth-child(2) > .unitsInput', scavengeArmy[index - 1].sword.toString())
  await page.type('.candidate-squad-widget > tbody > tr > td:nth-child(3) > .unitsInput', scavengeArmy[index - 1].axe.toString())
  await page.type('.candidate-squad-widget > tbody > tr > td:nth-child(4) > .unitsInput', scavengeArmy[index - 1].light.toString())
  await page.type('.candidate-squad-widget > tbody > tr > td:nth-child(5) > .unitsInput', scavengeArmy[index - 1].heavy.toString())

  console.log(scavengeArmy[index - 1])
  await page.evaluate(`document.getElementsByClassName('options-container')[0].children[${index - 1}].children[2].children[0].children[1].children[0].click()`)
  await delay(2000)
  console.log('completed')
}

async function populateArmyNumbers(armyAll: ArmyNumbers, results: boolean[], cache: Cache): Promise<ArmyNumbers[]> {
  const calc_page = await cache.browser.newPage()
  await calc_page.goto(`https://daniel.dmvandenberg.nl/scripting-tribal-wars/tribal-wars-scavenge-calculator/`)

  await catchRetry(`document.getElementById('world').selectedIndex=0`, calc_page)

  results[0] && await catchRetry(`document.getElementById('eff').click()`, calc_page)
  results[1] && await catchRetry(`document.getElementById('ebb').click()`, calc_page)
  results[2] && await catchRetry(`document.getElementById('ess').click()`, calc_page)
  results[3] && await catchRetry(`document.getElementById('err').click()`, calc_page)

  Object.keys(armyAll).forEach(async name => {
    if (armyAll[name] > 0)
      await catchRetry(`document.getElementById('${name}').value=${armyAll[name]}`, calc_page)
  })

  await calc_page.evaluate(`fnCalc()`)

  async function calculateArmies(index: number): Promise<ArmyNumbers> {
    const spears = await calc_page.evaluate(`document.getElementsByTagName('table')[0].rows[1].cells[${index + 1}].textContent`).then(Number.parseInt)
    const swords = await calc_page.evaluate(`document.getElementsByTagName('table')[0].rows[2].cells[${index + 1}].textContent`).then(Number.parseInt)
    const axes = await calc_page.evaluate(`document.getElementsByTagName('table')[0].rows[3].cells[${index + 1}].textContent`).then(Number.parseInt)
    const light = await calc_page.evaluate(`document.getElementsByTagName('table')[0].rows[5].cells[${index + 1}].textContent`).then(Number.parseInt)
    const heavy = await calc_page.evaluate(`document.getElementsByTagName('table')[0].rows[7].cells[${index + 1}].textContent`).then(Number.parseInt)

    console.log(`Calculated results for scavenge level ${index}`)
    const rval: ArmyNumbers = { spear: spears, sword: swords, axe: axes, light: light, heavy: heavy }
    console.log(rval)
    return rval
  }
  await calc_page.close()
  return await Promise.all([1, 2, 3, 4].map(calculateArmies))
}

async function optimal_scaveging(username: string, password: string, id: number, customNumbers?: [ArmyNumbers, boolean[]]) {
  const cache = await login(username, password, id)
  const page = cache.page
  await page.goto(generateSarrwsiUrl(id))
  const results = await Promise.all([1, 2, 3, 4].map(async i => await checkScaveging(i, page)))
  if (results.find(res => res === true) === undefined) {
    await waitForShortest(username,password,id,cache,customNumbers)
    return
  }
  const armyNumbers: number[] = await catchRetry(`Array.from(document.getElementsByClassName('units-entry-all squad-village-required')).map(el => Number.parseInt(el.textContent.match(/.(.*)./)[1]))`, page)

  if (armyNumbers.reduce((prev, curr, index) => prev + (curr * ((index < 3) ? 1 : (index === 3) ? 4 : 6)), 0) < 10) {
    await waitForShortest(username,password,id,cache,customNumbers)
    return
  }

  console.log(results)
  console.log(armyNumbers)

  const scavengeArmy = customNumbers ? await populateArmyNumbers({ spear: customNumbers[0].spear, sword: customNumbers[0].sword, axe: customNumbers[0].axe, light: customNumbers[0].light, heavy: customNumbers[0].heavy }, customNumbers[1],cache)
                                     : await populateArmyNumbers({ spear: armyNumbers[0], sword: armyNumbers[1], axe: armyNumbers[2], light: armyNumbers[3], heavy: armyNumbers[4] }, results, cache)
  results[0] && await sendScavenge(1,scavengeArmy,cache)
  results[1] && await sendScavenge(2,scavengeArmy,cache)
  results[2] && await sendScavenge(3,scavengeArmy,cache)
  results[3] && await sendScavenge(4,scavengeArmy,cache)

  await delay(1000)
  await waitForShortest(username,password,id,cache,customNumbers)
}

async function run(username:string,password:string,id:number,customNumbers?:[ArmyNumbers, boolean[]]) {
  while (true) {
    try {
      await optimal_scaveging(username,password,id,customNumbers)
    } catch (err) {
      console.log('Crashed, retrying')
      await optimal_scaveging(username,password,id,customNumbers)
    }
  }
}

type DefaultScriptArgs = {
  username: string
  password: string
  wait?: string
  village: number
}

let yargs_default_builder = (yargs: yargs.Argv): yargs.Argv<DefaultScriptArgs> => yargs
  .option('username', {
    alias: 'u',
    description: 'tribal wars username',
    type: 'string',
  })
  .demandOption('username')
  .option('password', {
    alias: 'p',
    description: 'tribal wars password',
    type: 'string',
  })
  .demandOption('password')
  .option('wait', {
    alias: 'w',
    description: 'initial waiting time',
    type: 'string'
  })
  .option('village', {
    alias: 'v',
    description: 'id of village',
    type: 'number'
  })
  .demandOption('village')

type CustomScriptArgs = {
  username: string
  password: string
  wait?: string
  first: boolean
  second: boolean
  third: boolean
  fourth: boolean
  spears: number
  swords: number
  axes: number
  light: number
  heavy: number
  village: number
}

let yargs_custom_builder = (yargs: yargs.Argv): yargs.Argv<CustomScriptArgs> => yargs
  .option('username', {
    alias: 'u',
    description: 'tribal wars username',
    type: 'string',
  })
  .demandOption('username')
  .option('password', {
    alias: 'p',
    description: 'tribal wars password',
    type: 'string',
  })
  .demandOption('password')
  .option('wait', {
    alias: 'w',
    description: 'initial waiting time',
    type: 'string'
  })
  .option('first', {
    alias: '1',
    description: 'use first scavenge',
    type: 'boolean',
    default: false
  })
  .option('second', {
    alias: '2',
    description: 'use second scavenge',
    type: 'boolean',
    default: false
  })
  .option('third', {
    alias: '3',
    description: 'use third scavenge',
    type: 'boolean',
    default: false
  })
  .option('fourth', {
    alias: '4',
    description: 'use fourth scavenge',
    type: 'boolean',
    default: false
  })
  .option('spears', {
    alias: 'sp',
    description: 'total number of spears',
    type: 'number',
    default: 0
  })
  .option('swords', {
    alias: 'sw',
    description: 'total number of swords',
    type: 'number',
    default: 0
  })
  .option('axes', {
    alias: 'ax',
    description: 'total number of axes',
    type: 'number',
    default: 0
  })
  .option('light', {
    alias: 'li',
    description: 'total number of light cavalry',
    type: 'number',
    default: 0
  })
  .option('heavy', {
    alias: 'he',
    description: 'total number of heavy cavalry',
    type: 'number',
    default: 0
  })
  .option('village', {
    alias: 'v',
    description: 'id of village',
    type: 'number'
  })
  .demandOption('village')

async function scavenging(args: DefaultScriptArgs) {
  const username = args.username
  const password = args.password
  const id = args.village
  if (args.wait) {
    const toWait = toMs(args.wait)
    console.log(`waiting for ${toWait} ms`)
    await delay(toWait + 2000)
  }
  run('1','2',3)
}

async function custom_scavenging(args: CustomScriptArgs) {
  if(typeof args.village === 'object') {
    
    const customNumbers = [{ spear: args.spears, sword: args.swords, axe: args.axes, light: args.light, heavy: args.heavy }, [args.first, args.second, args.third, args.fourth]]

  }
  console.log(args)
  console.log(args.village[0])
  console.log(typeof args.village)
  // scavenging(args)
}

const argv = yargs.default(process.argv.slice(2))
  .command('$0', 'scavenging bot', yargs_default_builder, scavenging)
  .command('custom', 'scavenging bot with custom army numbers', yargs_custom_builder, custom_scavenging)
  .argv
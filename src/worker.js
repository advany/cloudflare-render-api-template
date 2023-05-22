import puppeteer from "@cloudflare/puppeteer";

export default {
	async fetch(request, env, ctx) {

		let id = env.BROWSER.idFromName('browser-alarm');

		let obj = env.BROWSER.get(id);

		let resp = await obj.fetch(request.url, {
			method: 'POST',
			body: JSON.stringify({
				website: 'https://example.com'
			})
		});
		let metrics = await resp.text();
        return new Response(metrics);
	},
};

const KEEP_BROWSER_ALIVE_IN_SECONDS = 60;

export class Browser {
	constructor(state, env) {
	  this.state = state;
	  this.storage = this.state.storage;
	  this.env = env;
	  this.keptAliveInSeconds = 0;
	}
  
	async fetch(request) {
	  let url = new URL(request.url);
	  const data = await request.json()

	  if(!this.browser) {
		console.log(`Browser DO: Starting new instance`)
		this.browser = await puppeteer.launch(this.env.MYBROWSER);
	  }

	  // Reset keptAlive after each call to the Distributed Object (DO) from a worker.
	  this.keptAliveInSeconds = 0;

	  // set the first alarm
	  let currentAlarm = await this.storage.getAlarm();
      if (currentAlarm == null) {
		console.log(`Browser DO setting alarm`)
		const TEN_SECONDS = 10 * 1000;
        this.storage.setAlarm(Date.now() + TEN_SECONDS);
      }
  
	  // open new page to perform tasks
	  const page = await this.browser.newPage();
	  await page.goto(data.website);
	  const metrics = await page.metrics();

	  // close page
	  page.close();

	  // return data to worker
	  return new Response(JSON.stringify(metrics));
	}

	async alarm() {
		this.keptAliveInSeconds += 10;

		// Extend browser DO life
		if(this.keptAliveInSeconds < KEEP_BROWSER_ALIVE_IN_SECONDS) {
			console.log(`Browser DO has been kept alive for ${this.keptAliveInSeconds} seconds. Extending lifespan.`)
			this.storage.setAlarm(Date.now() + 10 * 1000);
		} else console.log(`Exceeded browser DO life of ${KEEP_BROWSER_ALIVE_IN_SECONDS}. Browser DO will be shut down in 10 seconds.`)
	}
  }
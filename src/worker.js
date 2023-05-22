import puppeteer from '@cloudflare/puppeteer';

export default {
  async fetch(request, env, ctx) {
    let id = env.BROWSER.idFromName('browser');

	const task = {website: 'https://example.com'}

    let obj = env.BROWSER.get(id);

    let resp = await obj.fetch(request.url, {
      method: 'POST',
      body: JSON.stringify(task),
    });
    let response_data_one_task = await resp.json();

	let id_multiple = env.BROWSER.idFromName('browser');

    let obj_multiple = env.BROWSER.get(id_multiple);

	let tasks = [];
	for(let i = 0; i < 100; i++) {
		tasks.push(task);
	}

    let resp_multiple = await obj_multiple.fetch(request.url, {
      method: 'POST',
      body: JSON.stringify(tasks),
    });
    let response_data_multiple = await resp_multiple.json();

    return new Response(JSON.stringify({
		one_task: response_data_one_task,
		mutliple_tasks: response_data_multiple
	}));
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
    const requestData = await request.json();

    if (!this.browser) {
      console.log(`Browser DO: Starting new instance`);
      try {
        this.browser = await puppeteer.launch(this.env.MYBROWSER);
      } catch (e) {
        console.log(`Browser DO: Could not start browser instance. Error: ${e}`);
      }
    }

    // Reset keptAlive after each call to the Distributed Object (DO) from a worker.
    this.keptAliveInSeconds = 0;

    // set the first alarm
    let currentAlarm = await this.storage.getAlarm();
    if (currentAlarm == null) {
      console.log(`Browser DO: setting alarm`);
      const TEN_SECONDS = 10 * 1000;
      this.storage.setAlarm(Date.now() + TEN_SECONDS);
    }
	
	var responseData = {}

	// execute single task
	if(typeof requestData === 'object' && !Array.isArray(requestData)) {
		responseData = await this.performTask(requestData);

	// execute multiple tasks
	} else if(Array.isArray(requestData)) {
		var startTime = new Date();
		responseData['results'] = await Promise.all(requestData.map(this.performTask.bind(this)));
		var endTime = new Date();
		responseData['execution_time'] = endTime - startTime;
	}

    // return data to worker
    return new Response(JSON.stringify(responseData));
  }

  async alarm() {
    this.keptAliveInSeconds += 10;

    // Extend browser DO life
    if (this.keptAliveInSeconds < KEEP_BROWSER_ALIVE_IN_SECONDS) {
      console.log(`Browser DO: has been kept alive for ${this.keptAliveInSeconds} seconds. Extending lifespan.`);
      this.storage.setAlarm(Date.now() + 10 * 1000);
    } else console.log(`Browser DO: cxceeded life of ${KEEP_BROWSER_ALIVE_IN_SECONDS}. Browser DO will be shut down in 10 seconds.`);
  }

  async performTask(requestData) {
	let responseData = {
		error: false,
	};

	console.log(`Browser DO: Executing task`);

	try {
		// open new page
		const page = await this.browser.newPage();

		// perform tasks
		var startTime = new Date();
		await page.goto(requestData.website);
		responseData['metrics'] = await page.metrics();
		await page.waitForNetworkIdle({
			idleTime: 2,
		});
		responseData['content'] = await page.content();
		var endTime = new Date();
		responseData['execution_time'] = endTime - startTime;

		// close page
		page.close();
	} catch (e) {
		console.log(`Browser DO: puppeteer failed with error: ${e}`);
		responseData['error'] = true;
	}
	return responseData
  }
}
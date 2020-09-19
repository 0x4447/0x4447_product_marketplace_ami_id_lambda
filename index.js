let AWS = require("aws-sdk");

//
//	This Lambda will get the AMI ID of a AWS Marketplace product for each
//	selected region.
//
exports.handler = (event) => {

	return new Promise(function(resolve, reject) {

		//
		//	1. This container holds all the data to be passed around the chain.
		//
		let container = {
			req: {
				id: event.id,
				regions: event.regions
			},
			//
			//	This array will keep all the prosmies to get the date
			//	from all the regions that our AMI is in.
			//
            promises: [],
            //
            //  Holds the raw result from AWS, which we have to clean up.
            //
            mixed_amis: null,
			//
			//	This array will hold the resoult of the previous query
			//	with tall the IDs that we've got back with the region.
			//
			ami_ids: [],
			//
			//	Formated JSON with all the data for CloudFront.
			//
			res: {}
		}

		//
		//	->	Start the chain.
		//
		execute_the_queries(container)
			.then(function(container) {

				return collect_all_the_promises(container);

			}).then(function(container) {

				return pick_the_public_ones(container);

			}).then(function(container) {

				return formatting(container);

			}).then(function(container) {

				//
				//  ->  Send back the good news.
				//
				return resolve(container.res);

			}).catch(function(error) {

				//
				//	->	Stop and surface the error.
				//
				return reject(error);

			});
	});
};

//	 _____    _____     ____    __  __   _____    _____   ______    _____
//	|  __ \  |  __ \   / __ \  |  \/  | |_   _|  / ____| |  ____|  / ____|
//	| |__) | | |__) | | |  | | | \  / |   | |   | (___   | |__    | (___
//	|  ___/  |  _  /  | |  | | | |\/| |   | |    \___ \  |  __|    \___ \
//	| |      | | \ \  | |__| | | |  | |  _| |_   ____) | | |____   ____) |
//	|_|      |_|  \_\  \____/  |_|  |_| |_____| |_____/  |______| |_____/
//

//
//	Going over all the regions that we want to query, and make an array
//	of promises with all the individual queris to AWS, so they can be executed
//	at the same time.
//
function execute_the_queries(container)
{
	return new Promise(function(resolve, reject) {

        console.info("execute_the_queries");

		//
		//	1.	Make the variable shorter.
		//
		let id = container.req.id;

		//
		//	2.	Looping over all the regions.
		//
		container.req.regions.forEach(function(region) {

			//
			//	1.	Make all the individual queris.
			//
			container.promises.push(query(region, id));

		})

		//
        //	->	Move to the next promise.
        //
        return resolve(container);

	});
}

//
//	Once we have all the queries prepared, we can execute them in on go.
//
function collect_all_the_promises(container)
{
	return new Promise(function(resolve, reject) {

		console.info("collect_all_the_promises");

		//
		//	1.	Exectue all the prosmies.
		//
		Promise.all(container.promises)
			.then(function(values) {

				//
                //	1.	Save all that we get as is, and we sort the result
                //      later.
				//
				container.mixed_amis = values;

				//
				//	->	Move to the next promise.
				//
				return resolve(container);

			}).catch(function(error){

				return reject(error);

			});

	});
}

//
//  AWS will send back pubnlic and private AMI IDs, and we only can use the
//  public ones. For this we have to filter out the private ones and keep
//  the public ones.
//
function pick_the_public_ones(container)
{
	return new Promise(function(resolve, reject) {

		console.info("pick_the_public_ones");

        //
        //  1.  Loop over all the data to find what we need.
        //
        container.mixed_amis.forEach(function(data) {

            //
            //  1.  First we save the region for the active AMI
            //
            let region = data.region;

            //
            //  2.  Then we loop across all the AMIs that we got back to find
            //      the public one.
            //
            data.amis.forEach(function(ami) {

                //
                //  1.  Be on high alert for the Public AMI - since this is what
                //      we are after.
                //
                if(ami.Public === true)
                {
                    //
                    //  1.  Once we have it all we put it together in to a nice
                    //      package.
                    //
                    container.ami_ids.push({
                        region: region,
                        ami_id: ami.ImageId
                    });
                }
            })
        });

		//
        //	->	Move to the next promise.
        //
        return resolve(container);

	});
}

//
//	Once we have our data back from AWS, we have to format it in a way
//	that is correct for our CloudFormation mapping section.
//
function formatting(container)
{
	return new Promise(function(resolve, reject) {

        console.info("formatting");

		//
		//	1.	Loop over what we've got back
		//
		container.ami_ids.forEach(function(ami_id) {

			//
			//	1.	Format the data to fit CF mapping standard.
			//
			container.res[ami_id.region] = {
				"64": ami_id.ami_id
			}

		});

		//
        //	->	Move to the next promise.
        //
        return resolve(container);

	});
}

//
//	This is a standalone Promise, used to make individual queris to
//	AWS using Promise All.
//
function query(region, id)
{
	return new Promise(function(resolve, reject) {

        console.info("query - " + region);

		//
		//	1.	We are initialzign the class over and over again on
		//		pourpes, becase we need to make queris to all the
		//		individual regions that our product is in.
		//
		let ec2 = new AWS.EC2({
			apiVersion: '2016-11-15',
			region: region
		});

		//
		//	2.	Prepare the query.
		//
		let params = {
			Filters: [
				{
					Name: 'name',
					Values: [
						'*' + id + '*',
					]
				}
			],
			Owners: [
				'aws-marketplace'
			]
		};

		//
		//	-->	Execute the query.
		//
		ec2.describeImages(params, function (error, data) {

			//
			//	1.	Check for internal errors.
			//
			if(error)
			{
				console.info(params);
				return reject(error);
            }

			//
			//	->	Move to the next promise.
			//
			return resolve({
				region: region,
				amis: data.Images
			});

		});

	});
}

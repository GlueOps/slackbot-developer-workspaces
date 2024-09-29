import { DescribeInstancesCommand, EC2Client } from "@aws-sdk/client-ec2";

export default async function getInstance({ userEmail = "", serverName = "" } = {}) {
    // This example describes the specified instance.
    const client = new EC2Client();

    const filters = [
        {
            Name: "instance-state-name",  // Filter by instance state
            Values: ["pending", "running", "shutting-down", "stopping", "stopped"]
        }
    ];

    if (userEmail) {
        filters.push({
            Name: "tag:Owner",
            Values: [userEmail]
        });
    } else if (serverName) {
        filters.push({
            Name: "tag:Name",
            Values: [serverName]
        });
    }

    const input = {
        Filters: filters,
        // "InstanceIds": [
        // "i-1234567890abcdef0"
        // ]
    };
    const command = new DescribeInstancesCommand(input);
    const response = await client.send(command);
    const instances = response.Reservations.flatMap(reservation => reservation.Instances);

    return instances;
}
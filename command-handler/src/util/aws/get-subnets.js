import { DescribeSubnetsCommand, EC2Client } from "@aws-sdk/client-ec2";

export default async function getSubnets({ region }) {
    const client = new EC2Client({ region });
    try {
        const { Subnets } = await client.send(new DescribeSubnetsCommand({}));

        const filteredSubnets = Subnets.filter(s =>
            s.Tags && s.Tags.some(tag => tag.Key === 'purpose' && tag.Value === 'cloud-developer-environments')
        );

        return filteredSubnets.map(s => s.SubnetId)[0];
    } catch (error) {
        console.error("Error retrieving subnets:", error);
    }
}
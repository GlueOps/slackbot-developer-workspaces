import { DescribeSecurityGroupsCommand, EC2Client } from "@aws-sdk/client-ec2";

export default async function getSecurityGroups({ region }) {
    const client = new EC2Client({ region });
    try {
        const { SecurityGroups } = await client.send(
        new DescribeSecurityGroupsCommand({}),
        );

        const filteredSecurityGroups = SecurityGroups.filter(sg =>
            sg.Tags && sg.Tags.some(tag => tag.Key === 'purpose' && tag.Value === 'cloud-developer-environments')
        );

        return filteredSecurityGroups.map(sg => sg.GroupId);
    } catch (err) {
        console.error(err);
        return [];
    }
}
import { EC2Client, DescribeImagesCommand } from "@aws-sdk/client-ec2";

export default async function getAwsImages() {
    const client = new EC2Client();
    const input = {
        Owners: ['self']
    };

    const command = new DescribeImagesCommand(input);
    const response = await client.send(command);
    
    return response.Images
    .sort((a, b) => new Date(b.CreationDate) - new Date(a.CreationDate))
    .slice(0, 5); // Get only the latest 5
}
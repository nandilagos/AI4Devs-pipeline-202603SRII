import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';

/**
 * Provisions the EC2 instance that the GitHub Actions pipeline deploys the
 * LTI backend onto.
 *
 * Design decisions (see infra/cdk/README.md):
 * - Uses the account's DEFAULT VPC (simplest, no NAT cost) via Vpc.fromLookup.
 * - Ubuntu 22.04 LTS resolved from an SSM public parameter (no hardcoded AMI id).
 * - Security Group: SSH (22) restricted to the operator IP (--context myIp),
 *   app port 3010 and HTTP 80 open to the world.
 * - UserData installs Node 20 (NodeSource), PM2 (global) and PostgreSQL 16
 *   (PGDG repo), listening on localhost only. NO Docker.
 * - An Elastic IP is associated so the public address survives stop/start.
 *
 * Nothing secret is hardcoded: the DB password, operator IP and key-pair name
 * are all supplied at deploy time via `--context`.
 */
export class LtiBackendStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // --- Required / optional context parameters -------------------------------
    const keyName = this.requireContext('keyName');
    const dbPassword = this.requireContext('dbPassword');
    const dbUser = this.node.tryGetContext('dbUser') ?? 'LTIdbUser';
    const dbName = this.node.tryGetContext('dbName') ?? 'LTIdb';

    // --- Network --------------------------------------------------------------
    const vpc = ec2.Vpc.fromLookup(this, 'DefaultVpc', { isDefault: true });

    const securityGroup = new ec2.SecurityGroup(this, 'BackendSg', {
      vpc,
      description: 'LTI backend EC2 - SSH and app port 3010',
      allowAllOutbound: true,
    });
    // SSH is open to the world so GitHub Actions hosted runners (dynamic IPs) can
    // deploy over SSH. Authentication is key-only (the .pem); password login is off.
    securityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(22), 'SSH (key-only) - open for CI runners');
    securityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(3010), 'LTI backend app port');
    // No Nginx is installed, so port 80 is intentionally NOT opened. The backend
    // is reached directly on http://<public-ip>:3010 (served by PM2).

    // --- AMI: Ubuntu 22.04 LTS via SSM public parameter (no hardcoded id) -----
    const machineImage = ec2.MachineImage.fromSsmParameter(
      '/aws/service/canonical/ubuntu/server/22.04/stable/current/amd64/hvm/ebs-gp2/ami-id',
      { os: ec2.OperatingSystemType.LINUX },
    );

    // --- UserData: Node 20 + PM2 + PostgreSQL 16 (no Docker) ------------------
    const userData = ec2.UserData.forLinux();
    userData.addCommands(
      'set -euxo pipefail',
      'export DEBIAN_FRONTEND=noninteractive',
      'apt-get update -y',
      'apt-get install -y curl ca-certificates gnupg lsb-release rsync',
      '',
      '# --- Node.js 20 LTS (NodeSource) ---',
      'curl -fsSL https://deb.nodesource.com/setup_20.x | bash -',
      'apt-get install -y nodejs',
      '',
      '# --- PM2 (global) ---',
      'npm install -g pm2',
      '',
      '# --- PostgreSQL 16 (official PGDG repo) ---',
      'install -d /usr/share/postgresql-common/pgdg',
      'curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.gpg',
      'echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.gpg] https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list',
      'apt-get update -y',
      'apt-get install -y postgresql-16',
      'systemctl enable postgresql',
      'systemctl start postgresql',
      '',
      '# --- Database role + database (idempotent) ---',
      // Postgres listens on localhost only by default; we do not touch listen_addresses.
      `sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname = '${dbUser}'" | grep -q 1 || sudo -u postgres psql -c "CREATE ROLE \\"${dbUser}\\" WITH LOGIN PASSWORD '${dbPassword}';"`,
      `sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname = '${dbName}'" | grep -q 1 || sudo -u postgres psql -c "CREATE DATABASE \\"${dbName}\\" OWNER \\"${dbUser}\\";"`,
      '',
      '# --- Deploy directory owned by the ubuntu user ---',
      'mkdir -p /home/ubuntu/lti-backend',
      'chown -R ubuntu:ubuntu /home/ubuntu/lti-backend',
    );

    // --- Instance -------------------------------------------------------------
    const instance = new ec2.Instance(this, 'BackendInstance', {
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T2, ec2.InstanceSize.MICRO),
      machineImage,
      securityGroup,
      keyPair: ec2.KeyPair.fromKeyPairName(this, 'KeyPair', keyName),
      userData,
      // No blockDevices override: the Ubuntu gp2 AMI ships an 8 GB root volume.
    });

    // --- Elastic IP -----------------------------------------------------------
    const eip = new ec2.CfnEIP(this, 'BackendEip', {
      domain: 'vpc',
      instanceId: instance.instanceId,
    });

    // --- Outputs --------------------------------------------------------------
    new cdk.CfnOutput(this, 'PublicIp', {
      value: eip.attrPublicIp,
      description: 'Public Elastic IP of the EC2 instance',
    });
    new cdk.CfnOutput(this, 'SshCommand', {
      value: `ssh -i ${keyName}.pem ubuntu@${eip.attrPublicIp}`,
      description: 'Ready-to-copy SSH command (run from the directory holding the .pem)',
    });
    new cdk.CfnOutput(this, 'DatabaseUrl', {
      value: `postgresql://${dbUser}:${dbPassword}@localhost:5432/${dbName}`,
      description: 'DATABASE_URL to place in /home/ubuntu/lti-backend/.env on the instance',
    });
  }

  /** Reads a required context value or throws a clear, actionable error. */
  private requireContext(key: string): string {
    const value = this.node.tryGetContext(key);
    if (value === undefined || value === null || value === '') {
      throw new Error(
        `Missing required context "${key}". Pass it with --context ${key}=<value> on cdk deploy/synth.`,
      );
    }
    return String(value);
  }
}

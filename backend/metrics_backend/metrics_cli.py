from gevent import monkey, config  # isort:skip # noqa
# there were some issues with the 'thread' resolver, remove it from the options
config.resolver = ['dnspython', 'ares', 'block']  # noqa
monkey.patch_all()  # isort:skip # noqa

import logging
import os
import sys
import json

import click
import gevent
from eth_utils import is_checksum_address
from web3 import HTTPProvider, Web3
from requests.exceptions import ConnectionError
from raiden_libs.no_ssl_patch import no_ssl_verification
from raiden_contracts.contract_manager import CONTRACT_MANAGER

from metrics_backend.api.rest import NetworkInfoAPI
from metrics_backend.metrics_service import MetricsService
from metrics_backend.utils.serialisation import token_network_to_dict

log = logging.getLogger(__name__)

REGISTRY_ADDRESS = '0xf2a175A52Bd3c815eD7500c765bA19652AB89B30'
DEFAULT_PORT = 4567
OUTPUT_FILE = 'network-info.json'
TEMP_FILE = 'tmp.json'
OUTPUT_PERIOD = 10  # seconds


@click.command()
@click.option(
    '--eth-rpc',
    default='http://geth.ropsten.ethnodes.brainbot.com:8545',
    type=str,
    help='Ethereum node RPC URI'
)
@click.option(
    '--registry-address',
    type=str,
    help='Address of the token network registry'
)
@click.option(
    '--start-block',
    default=0,
    type=int,
    help='Block to start syncing at'
)
def main(
    eth_rpc,
    registry_address,
    start_block,
):
    # setup logging
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        datefmt='%m-%d %H:%M:%S',
    )

    logging.getLogger('web3').setLevel(logging.INFO)
    logging.getLogger('urllib3.connectionpool').setLevel(logging.ERROR)

    if not is_checksum_address(registry_address):
        log.error('Provided registry address is not valid:', registry_address)
        sys.exit(1)
    if start_block < 0:
        log.error('Provided start block is not valid:', start_block)
        sys.exit(1)

    log.info("Starting Raiden Metrics Server")

    try:
        log.info(f'Starting Web3 client for node at {eth_rpc}')
        web3 = Web3(HTTPProvider(eth_rpc))
    except ConnectionError:
        log.error(
            'Can not connect to the Ethereum client. Please check that it is running and that '
            'your settings are correct.'
        )
        sys.exit()

    with no_ssl_verification():
        service = None
        try:
            service = MetricsService(
                web3=web3,
                contract_manager=CONTRACT_MANAGER,
                registry_address=registry_address,
                sync_start_block=start_block,
            )

            # re-enable once deployment works
            # gevent.spawn(write_topology_task, service)

            api = NetworkInfoAPI(service)
            api.run(port=DEFAULT_PORT)
            print(f'Running metrics endpoint at http://localhost:{DEFAULT_PORT}/json')

            print('Raiden Status Page backend running...')
            service.run()

        except (KeyboardInterrupt, SystemExit):
            print('Exiting...')
        finally:
            if service:
                log.info('Stopping Raiden Metrics Backend')
                service.stop()

    return 0


def write_topology_task(pathfinding_service: MetricsService):
    while True:
        result = dict(
            num_networks=len(pathfinding_service.token_networks),
        )

        result.update(
            {
                network.address: token_network_to_dict(network)
                for network in pathfinding_service.token_networks.values()
            }
        )

        # write to a temp file, then rename to have a consistent file all the time
        # rename is atomic
        with open(TEMP_FILE, 'w') as f:
            json.dump(result, f)

        os.rename(TEMP_FILE, OUTPUT_FILE)
        log.info(f'Wrote network infos to {OUTPUT_FILE}')

        gevent.sleep(OUTPUT_PERIOD)


if __name__ == "__main__":
    main(auto_envvar_prefix='EXPLORER')

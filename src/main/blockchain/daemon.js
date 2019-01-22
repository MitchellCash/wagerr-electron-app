import os from 'os';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import fsPath from 'fs-path';
import {dialog} from 'electron';
import decompress from 'decompress';
import constants from '../constants/constants';
import { spawn, execSync } from 'child_process';
const packageJSON = require('../../../package.json');
import * as blockchain from '../blockchain/blockchain';
import findProcess from "find-process";

export default class Daemon {

    handlers;
    wagerrdProcess;

    constructor () {

    }

    /**
     * Launch the wagerrd process with the given list of command line args.
     */
    launch (args) {
        let wagerrdPath = this.getWagerrdPath();
        let wagerrdArgs = this.getWagerrdArgs(args);

        console.log('\x1b[32m Launching daemon:' + wagerrdPath + '\x1b[32m');
        console.log('\x1b[32m Following args used:' + wagerrdArgs + '\x1b[32m');

        // Change file permissions so we can run the wagerrd.
        fs.chmod(wagerrdPath, '0777', (err) => {
            if (err) {
                console.error(err)
            }
        });

        this.wagerrdProcess = spawn(wagerrdPath, wagerrdArgs);
        this.wagerrdProcess.stdout.on('data', data => console.log(`Daemon: ${data}`));
        this.wagerrdProcess.stderr.on('data', data => console.error(`Daemon: ${data}`));
        this.wagerrdProcess.on('error', data => console.log(`Daemon: ${data}`));
        this.wagerrdProcess.on('exit', data => {
            dialog.showMessageBox({
                type: 'error',
                buttons: ['OK'],
                message: 'Wagerr daemon has stopped!',
                detail: 'The Wagerr daemon is no longer running, Wagerr wallet will now exit.'
            });
        });
    }

    /**
     * Stop the wagerrd process.
     *
     * @returns {Promise<void>}
     */
    async stop () {
        console.log('Stopping wagerrd....');

        if (process.platform === 'win32') {
            try {
                execSync(`taskkill /pid ${this.wagerrdProcess.pid} /t /f`);
            }
            catch (error) {
                console.error(error.message);
            }
        }
        else {
            let isRunning = await this.isWagerrdRunning();

            if (isRunning) {
                await this.wagerrdProcess.kill();
            }
        }
    }

    /**
     * Download the correct Wagerr Daemon version for a users enviornment.
     *
     * @returns {Promise}
     */
    async downloadWagerrDaemon () {
        return new Promise((resolve, reject) => {

            const daemonURLTemplate = packageJSON.wagerrSettings.daemonUrlTemplate;
            const daemonVersion = packageJSON.wagerrSettings.daemonVersion;
            let daemonFileName = packageJSON.wagerrSettings.daemonFileName;
            const daemonDir = packageJSON.wagerrSettings.daemonDir;
            let daemonOriginalName = packageJSON.wagerrSettings.daemonOriginalName;

            let buildingPlatform = os.platform();

            let daemonPlatform = constants.OSX_64;
            let daemonExt = constants.TAR_EXT;

            // Mac
            if (buildingPlatform === constants.MAC) {
                daemonPlatform = constants.OSX_64;
                daemonExt = constants.TAR_EXT;
            }

            // Linux
            if (buildingPlatform === constants.LINUX) {
                daemonPlatform = constants.LINUX_X86_64;
                daemonExt = constants.TAR_EXT;
            }

            // Windows
            if (buildingPlatform === constants.WIN_32) {
                daemonPlatform = constants.WIN_64;
                daemonExt = constants.ZIP_EXT;
                daemonFileName = daemonFileName + constants.EXE_EXT;
                daemonOriginalName = daemonOriginalName + constants.EXE_EXT;
            }

            // Create the URL used to download the Wagerr daemon.
            const daemonURL = daemonURLTemplate
                .replace(/DAEMONVER/g, daemonVersion)
                .replace(/OSNAME/g, daemonPlatform)
                .replace(/OSEXT/g, daemonExt);
            const tmpZipPath = 'dist/daemon.' + daemonExt;

            console.log('\x1b[32m' + daemonURL, '\nDownloading daemon...\x1b[32m');

            // Send get request to download.
            axios.get(daemonURL, {
                responseType: 'arraybuffer',
                headers: {
                    'Content-Type': 'application/zip'
                }
            })
            .then(
                result => new Promise((resolve, reject) => {
                    fsPath.writeFile(tmpZipPath, result.data, error => {
                        if (error) {
                            return reject(error);
                        }
                    });
                })
            )
            .then(() => {
                return decompress(tmpZipPath, 'static/daemon/', {
                    filter: file => {
                        return file.path === daemonFileName;
                    },
                    strip: 2
                })
            })
            .then(() => {
                fs.rename(`static/daemon/wagerrd`, `${daemonDir}/${daemonOriginalName}`, function (error) {
                    if (error) return reject(error);
                })
            })
            .then(() => {
                resolve(true);
            })
            .catch(error => {
                console.error(`\x1b[31merror\x1b[0m Daemon download failed due to: \x1b[35m${error}\x1b[0m`);
                reject(error)
            })
        })
    }

    /**
     * Checks if the wagerrd executable exists in the correct location.
     *
     * @returns {boolean}
     */
    wagerrdExists () {
        return fs.existsSync('static/daemon/wagerrd') || fs.existsSync('static/daemon/wagerrd.exe');
    }

    /**
     * Check if the wagerr daemon process is running on the current system.
     * @returns {Promise<*>}
     */
    async isWagerrdRunning () {
        let processList = await findProcess('name', `daemon/${blockchain.daemonName}`);

        return processList.length > 0;
    }

    /**
     * Returns the wagerrd file path.
     *
     * @returns string
     */
    getWagerrdPath () {
        return process.env.WAGERR_DAEMON || path.join(__static, `daemon/${blockchain.daemonName}${os.platform() === 'win32' ? '.exe' : ''}`).replace('app.asar', 'app.asar.unpacked')
    }

    /**
     * Daemon constructor which builds the list of args used when launching the wagerrd.
     */
    getWagerrdArgs (args) {
        // Required args.
        let wagerrdArgs = [`-rpcuser=${blockchain.rpcUser}`, `-rpcpassword=${blockchain.rpcPass}`, `-rpcbind=127.0.0.1`, `-server=1`];

        // Add Supplied args if any.
        if (args) {
            wagerrdArgs.push(args);
        }

        return wagerrdArgs;
    }

}
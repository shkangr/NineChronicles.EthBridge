export interface IPlanetIds {
    odin: string;
    heimdall: string;
}

export interface IPlanetVaultAddress {
    heimdall: string;
}

export class MultiPlanetary {
    private readonly _planetIds: IPlanetIds;
    private readonly _planetVaultAddresses: IPlanetVaultAddress;
    constructor(
        planetIds: IPlanetIds,
        planetVaultAddresses: IPlanetVaultAddress
    ) {
        this._planetIds = planetIds;
        this._planetVaultAddresses = planetVaultAddresses;
    }

    isMultiPlanetRequest(_to: string): boolean {
        const multiPlanetIdRegex = /^[0-9]0{10}[0-9]*$/;
        return multiPlanetIdRegex.test(_to.substring(2, 14));
    }

    getRequestPlanetName(_to: string): string {
        let planetName = "odin";

        if (!this.isMultiPlanetRequest(_to)) {
            return "odin";
        }

        /**
         * If requestPlanetId is not in this._planetIds ( Invalid Multi-Planet Id )
         * Then send request to "odin".
         */
        for (const key of Object.keys(this._planetIds)) {
            if (_to.startsWith(this._planetIds[key as keyof IPlanetIds])) {
                planetName = key;
                break;
            }
        }

        return planetName;
    }

    isOtherPlanetRequest(planetName: string): boolean {
        return planetName !== "odin";
    }

    getPlanetVaultAddress(planetName: string): string {
        return this._planetVaultAddresses[
            planetName as keyof IPlanetVaultAddress
        ];
    }
}

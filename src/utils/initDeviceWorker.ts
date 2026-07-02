

import { SpinalNetworkUtils } from "./SpinalNetworkUtils";
import { parentPort, workerData } from "worker_threads";

(async () => {
    try {
        
        const spinalNetworkUtils = SpinalNetworkUtils.getInstance();
        const result = await spinalNetworkUtils.initSpinalListenerModel(workerData.listenerData);

        parentPort?.postMessage({ ok: true, result });
    } catch (error: Error | any) {
        parentPort?.postMessage({ ok: false, error: error?.message || "Worker initialization failed" });
    }

})();

import { Console } from "console";


class SpinalLog extends Console {

    private static instance: SpinalLog;

    private constructor() {
        super(process.stdout, process.stderr);
    }

    public static getInstance(): SpinalLog {
        if (!this.instance) {
            this.instance = new SpinalLog();
        }
        return this.instance;
    }

}


const spinalLog = SpinalLog.getInstance();
export default spinalLog;
export { spinalLog };
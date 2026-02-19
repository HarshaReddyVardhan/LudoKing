export class Logger {
    private static format(level: string, messageOrObject: any, context?: any): string {
        let payload: any = {};

        if (messageOrObject instanceof Error) {
            payload = {
                message: messageOrObject.message,
                stack: messageOrObject.stack,
                ...context
            };
        } else if (typeof messageOrObject === 'string') {
            payload = { message: messageOrObject, ...context };
        } else {
            payload = { ...messageOrObject, ...context };
        }

        // Handle Error in context if present
        if (context && context.error instanceof Error) {
            payload.error = {
                message: context.error.message,
                stack: context.error.stack
            };
        }

        return JSON.stringify({
            timestamp: new Date().toISOString(),
            level,
            ...payload
        });
    }

    static info(messageOrObject: any, context?: any) {
        console.log(this.format('INFO', messageOrObject, context));
    }

    static warn(messageOrObject: any, context?: any) {
        console.warn(this.format('WARN', messageOrObject, context));
    }

    static error(messageOrObject: any, context?: any) {
        console.error(this.format('ERROR', messageOrObject, context));
    }
}

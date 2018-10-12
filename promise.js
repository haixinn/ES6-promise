let nextTick;
if (process && process.nextTick) {
    nextTick = process.nextTick;
} else {
    nextTick = setTimeout;
}

const status = Symbol('status');
const result = Symbol('result');
const callbacks = Symbol('callbacks');

class Promise {
    constructor(resolver) {
        let self = this;

        if (typeof resolver !== 'function') {
            throw new TypeError('Promise constructor arguments resolver must be a function.');
        }

        self[status] = 'pending';
        self[result] = undefined;
        self[callbacks] = [];

        function resolve(value) {
            nextTick(() => {
                if (self[status] === 'pending') {
                    self[status] = 'resolved';
                    self[result] = value;
                    self[callbacks].map(cb => cb.onResolved(self[result]));
                }
            });
        }

        function reject(reason) {
            nextTick(() => {
                if (self[status] === 'pending') {
                    self[status] = 'rejected';
                    self[result] = reason;
                    self[callbacks].map(cb => cb.onRejected(self[result]));
                }
            });
        }

        try {
            resolver(resolve, reject);
        } catch (e) {
            reject(e);
        }
    }

    then(onResolved, onRejected) {
        onResolved = typeof onResolved === 'function' ? onResolved : v => v;
        onRejected = typeof onRejected === 'function' ? onRejected : r => { throw r };

        let p, self = this;
        // 根据 x 的值来决定 promise 的状态的函数
        // x 为 promise = new Promise().then(onResolved, onRejected)里 onResolved/onRejected 的返回值
        // resolve 和 reject 为 promise resolver 的参数
        function solver(promise, x, resolve, reject) {
            let then, thenCalled = false;

            if (promise === x) {
                return reject(new TypeError('Cycle called Promises'));
            }

            if (x instanceof Promise) {
                //如果 x 的状态还没有确定，那么它是有可能被一个thenable决定最终状态和值的
                if (x[status] === 'pending') {
                    x.then(v => solver(promise, v, resolve, reject), reject);
                } else {
                    x.then(resolve, reject);
                }
            } else if (x !== null && (typeof x === 'object' || typeof x === 'function')) {
                try {
                    then = x.then;
                    if (typeof (then) === 'function') {
                        then.call(x, s => {
                            if (thenCalled) return;
                            thenCalled = true;
                            return solver(promise, s, resolve, reject);
                        }, r => {
                            if (thenCalled) return;
                            thenCalled = true;
                            return reject(r);
                        });
                    } else {
                        return resolve(x);
                    }
                } catch (e) {
                    if (thenCalled) return;
                    thenCalled = true;
                    return reject(e);
                }
            } else {
                return resolve(x);
            }
        }

        function childExec(value, onExec, resolve, reject, p) {
            try {
                let x = onExec(value);
                solver(p, x, resolve, reject);
            } catch (e) {
                reject(e);
            }
        }

        switch (self[status]) {
            case 'resolved':
                p = new Promise((resolve, reject) => {
                    nextTick(() => childExec(self[result], onResolved, resolve, reject, p));
                });
                break;
            case 'rejected':
                p = new Promise((resolve, reject) => {
                    nextTick(() => childExec(self[result], onRejected, resolve, reject, p));
                });
                break;
            case 'pending':
                p = new Promise((resolve, reject) => {
                    self[callbacks].push({
                        onResolved: value => childExec(value, onResolved, resolve, reject, p),
                        onRejected: value => childExec(value, onRejected, resolve, reject, p)
                    });
                });
                break;
            default:
                throw new TypeError('Invalid status value');
        }

        return p;
    }

    catch(onRejected) {
        return this.then(null, onRejected)
    }

    static resolve(value) {
        return new Promise((resolve, reject) => resolve(value));
    }

    static reject(value) {
        return new Promise((resolve, reject) => reject(value));
    }

    static all(promises) {
        return new Promise((resolve, reject) => {
            let count = 0
            let len = promises.length
            let values = new Array(len)
            for (let i = 0; i < len; i++) {
                Promise.resolve(promises[i]).then(value => {
                    count++
                    values[i] = value
                    if (count === len) {
                        return resolve(values)
                    }
                }, reason => reject(reason))
            }
        })
    }
    static race(promises) {
        return new Promise((resolve, reject) => {
            for (let i = 0; i < promises.length; i++) {
                Promise.resolve(promises[i]).then(value => {
                    return resolve(value)
                }, reason => reject(reason))
            }
        })
    }
    // static race(promises) {
    //     return new Promise((resolve, reject) => promises.find(resolve));
    // }

    static try(fn) {
        return new Promise((resolve, reject) => fn);
    }

    static deferred() {
        let dfd = {};
        dfd.promise = new Promise((resolve, reject) => {
            dfd.resolve = resolve;
            dfd.reject = reject;
        });
        return dfd;
    }
};

module.exports = Promise;

package com.cafelink.server;

import com.cafelink.common.Message;
import com.cafelink.common.Models.Identity;
import java.util.concurrent.atomic.AtomicBoolean;

/** Local opt-in experiment hook; never configurable by a remote client. */
@FunctionalInterface
public interface FaultInjector {
    enum Point { BEFORE_ACCEPT, AFTER_COMMIT }
    FaultInjector NONE = (point, identity, request) -> false;
    boolean disconnect(Point point, Identity identity, Message request);
    static FaultInjector once(Point target, String action) {
        AtomicBoolean armed = new AtomicBoolean(true);
        return (point, identity, request) -> point == target && request.action().equals(action) && armed.compareAndSet(true, false);
    }
}

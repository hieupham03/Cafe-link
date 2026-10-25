package com.cafelink.client;

import java.io.IOException;

public final class RemoteException extends IOException {
    private final String code;
    public RemoteException(String code, String detail) { super(detail); this.code = code; }
    public String code() { return code; }
}

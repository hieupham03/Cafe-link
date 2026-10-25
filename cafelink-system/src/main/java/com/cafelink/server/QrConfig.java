package com.cafelink.server;

import javax.crypto.*;
import javax.crypto.spec.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.io.IOException;
import java.security.*;
import java.time.Clock;
import java.util.*;

/** Deployment key is external to SQLite/source. Clock is injectable for expiry acceptance tests. */
public final class QrConfig {
    final Clock clock;
    private final SecretKeySpec key;
    private final SecureRandom random = new SecureRandom();
    public QrConfig(byte[] key, Clock clock) {
        if (key.length != 32) throw new IllegalArgumentException("QR encryption needs a 32-byte AES key.");
        this.key = new SecretKeySpec(key.clone(), "AES"); this.clock = Objects.requireNonNull(clock);
    }
    public static QrConfig deployment(Path keyFile, String encodedKey) throws IOException {
        if (encodedKey != null && !encodedKey.isBlank()) {
            try { return new QrConfig(Base64.getDecoder().decode(encodedKey), Clock.systemUTC()); }
            catch (IllegalArgumentException e) { throw new IllegalArgumentException("CAFELINK_QR_KEY must be base64 of exactly 32 random bytes."); }
        }
        Path absolute = keyFile.toAbsolutePath(); Files.createDirectories(absolute.getParent());
        if (!Files.exists(absolute)) {
            byte[] generated = new byte[32]; new SecureRandom().nextBytes(generated);
            try { Files.write(absolute, generated, StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE); }
            catch (FileAlreadyExistsException raced) { /* Another launch created the deployment key; read it below. */ }
        }
        return new QrConfig(Files.readAllBytes(absolute), Clock.systemUTC());
    }
    String secret() { byte[] token = new byte[32]; random.nextBytes(token); return Base64.getUrlEncoder().withoutPadding().encodeToString(token); }
    String signPayment(String value){
        try{Mac mac=Mac.getInstance("HmacSHA256");mac.init(new SecretKeySpec(key.getEncoded(),"HmacSHA256"));return HexFormat.of().formatHex(mac.doFinal(("LOCAL_PAYMENT\n"+value).getBytes(StandardCharsets.UTF_8)));}
        catch(GeneralSecurityException e){throw new IllegalStateException(e);}
    }
    String encrypt(String plaintext, String context) {
        byte[] iv = new byte[12]; random.nextBytes(iv);
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(128, iv)); cipher.updateAAD(context.getBytes(StandardCharsets.UTF_8));
            byte[] encrypted = cipher.doFinal(plaintext.getBytes(StandardCharsets.UTF_8));
            byte[] encoded = Arrays.copyOf(iv, iv.length + encrypted.length); System.arraycopy(encrypted, 0, encoded, iv.length, encrypted.length);
            return Base64.getUrlEncoder().withoutPadding().encodeToString(encoded);
        } catch (GeneralSecurityException e) { throw new IllegalStateException("QR encryption unavailable", e); }
    }
    String decrypt(String encoded, String context) {
        try {
            byte[] data = Base64.getUrlDecoder().decode(encoded);
            if (data.length < 29) throw new GeneralSecurityException();
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(128, Arrays.copyOf(data, 12)));
            cipher.updateAAD(context.getBytes(StandardCharsets.UTF_8));
            return new String(cipher.doFinal(data, 12, data.length - 12), StandardCharsets.UTF_8);
        } catch (GeneralSecurityException | IllegalArgumentException e) {
            throw new BusinessException("QR_KEY_UNAVAILABLE", "Không đọc được QR bằng khóa hiện tại. Khôi phục khóa sao lưu hoặc chủ động cấp lại QR.");
        }
    }
}

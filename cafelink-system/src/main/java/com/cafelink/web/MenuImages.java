package com.cafelink.web;
import javax.imageio.*;
import javax.imageio.stream.ImageInputStream;
import java.awt.*;
import java.awt.image.BufferedImage;
import java.io.*;
import java.nio.file.*;
import java.security.*;
import java.util.*;

/** Bounded raster decoder; filenames and client MIME are never trusted. */
final class MenuImages {
    static final int LIMIT=2*1024*1024;
    private final Path root;
    MenuImages(Path root){this.root=root.toAbsolutePath().normalize();}
    String save(byte[] bytes)throws IOException {
        if(bytes.length==0||bytes.length>LIMIT)throw new IOException("Ảnh tối đa 2 MiB.");
        BufferedImage source;
        try(ImageInputStream stream=ImageIO.createImageInputStream(new ByteArrayInputStream(bytes))){
            var readers=ImageIO.getImageReaders(stream);if(!readers.hasNext())throw new IOException("Chỉ nhận ảnh JPEG/PNG hợp lệ.");
            ImageReader reader=readers.next();try{
                if(!Set.of("JPEG","JPG","PNG").contains(reader.getFormatName().toUpperCase(Locale.ROOT)))throw new IOException("Chỉ nhận JPEG/PNG.");
                reader.setInput(stream,true,true);int w=reader.getWidth(0),h=reader.getHeight(0);
                if(w<1||h<1||w>6000||h>6000||(long)w*h>12000000)throw new IOException("Ảnh tối đa 12 megapixel, mỗi cạnh không quá 6000px.");
                source=reader.read(0);
            }finally{reader.dispose();}
        }
        byte[] normalized=jpeg(source,960);
        String hash;try{hash=HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(normalized));}catch(NoSuchAlgorithmException e){throw new IllegalStateException(e);}
        Files.createDirectories(root);
        write(hash+".jpg",normalized);write(hash+"-thumb.jpg",jpeg(source,320));return "/media/"+hash+".jpg";
    }
    private void write(String name,byte[] bytes)throws IOException {try{Files.write(root.resolve(name),bytes,StandardOpenOption.CREATE_NEW);}catch(FileAlreadyExistsException duplicate){}}
    private static byte[] jpeg(BufferedImage source,int max)throws IOException{
        double scale=Math.min(1,(double)max/Math.max(source.getWidth(),source.getHeight()));BufferedImage out=new BufferedImage(Math.max(1,(int)(source.getWidth()*scale)),Math.max(1,(int)(source.getHeight()*scale)),BufferedImage.TYPE_INT_RGB);
        Graphics2D g=out.createGraphics();try{g.setColor(Color.WHITE);g.fillRect(0,0,out.getWidth(),out.getHeight());g.setRenderingHint(RenderingHints.KEY_INTERPOLATION,RenderingHints.VALUE_INTERPOLATION_BICUBIC);g.drawImage(source,0,0,out.getWidth(),out.getHeight(),null);}finally{g.dispose();}
        ByteArrayOutputStream bytes=new ByteArrayOutputStream();if(!ImageIO.write(out,"JPEG",bytes))throw new IOException("Không mã hóa được ảnh.");return bytes.toByteArray();
    }
    byte[] read(String path)throws IOException{
        if(!path.matches("/media/[a-f0-9]{64}(-thumb)?\\.jpg"))return null;
        Path file=root.resolve(path.substring(7));if(!Files.isRegularFile(file)||!file.toRealPath().startsWith(root.toRealPath()))return null;return Files.readAllBytes(file);
    }
}

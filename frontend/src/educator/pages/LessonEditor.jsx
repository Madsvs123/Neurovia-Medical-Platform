import React, { useState, useEffect, useRef } from 'react';
import {
  Box, Container, Heading, Text, Spinner, Alert, AlertIcon, Badge, Flex,
  Button, useColorModeValue, useToast, Icon, HStack, VStack, Divider,
  FormControl, FormLabel, Input, Textarea, SimpleGrid, Image,
  IconButton,
} from '@chakra-ui/react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { FiArrowLeft, FiSave, FiVideo, FiFileText, FiUpload, FiExternalLink, FiTrash2 } from 'react-icons/fi';
import { getLessonById, updateLesson, deleteLesson } from '../services/api';
import dayjs from 'dayjs';
import { API_BASE_URL } from '../../lib/http';

const LessonEditor = () => {
  const { courseId, lessonId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const fileInputRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [lesson, setLesson] = useState(null);
  const [form, setForm] = useState({
    title: '', content: '', videoUrl: '', videoDescription: '',
    estimatedReadTime: '', order: 1
  });
  const cardBg = useColorModeValue('white', 'gray.800');

  useEffect(() => {
    const fetchLesson = async () => {
      try {
        setLoading(true);
        const { data } = await getLessonById(lessonId);
        const l = data.lesson || data;
        setLesson(l);
        setForm({
          title: l.title,
          content: l.content || '',
          videoUrl: l.videoUrl || '',
          videoDescription: l.videoDescription || '',
          estimatedReadTime: l.estimatedReadTime?.toString() || '',
          order: l.order || 1,
        });
      } catch (err) {
        setError('Failed to load lesson');
      } finally { setLoading(false); }
    };
    fetchLesson();
  }, [lessonId]);

  const handleSave = async () => {
    if (!form.title || !form.content) { toast({ title: 'Title and content required', status: 'warning', duration: 3000 }); return; }
    setSaving(true);
    try {
      const payload = {
        title: form.title, content: form.content,
        videoUrl: form.videoUrl || undefined, videoDescription: form.videoDescription || undefined,
        estimatedReadTime: form.estimatedReadTime ? parseInt(form.estimatedReadTime) : undefined,
        order: parseInt(form.order) || 1,
      };
      await updateLesson(lessonId, payload);
      toast({ title: 'Lesson saved', status: 'success', duration: 2000 });
    } catch (err) {
      toast({ title: 'Save failed', description: err.response?.data?.message, status: 'error', duration: 3000 });
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!window.confirm('Delete this lesson permanently?')) return;
    try {
      await deleteLesson(lessonId);
      toast({ title: 'Deleted', status: 'success', duration: 2000 });
      navigate(`/educator/courses/${courseId}`);
    } catch { toast({ title: 'Error', status: 'error', duration: 2000 }); }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // For now, we add the filename as an attachment reference
    // In production, this would upload to a server
    try {
      const formData = new FormData();
      formData.append('file', file);
      const { data } = await (await import('../services/api')).default.post('/api/uploads', formData);
      const fileUrl = data.file?.filename || data.file?.path || file.name;
      const currentAttachments = lesson.attachments || [];
      const updated = [...currentAttachments, fileUrl];
      await updateLesson(lessonId, { attachments: updated });
      setLesson(prev => ({ ...prev, attachments: updated }));
      toast({ title: 'File uploaded', status: 'success', duration: 2000 });
    } catch (err) {
      // Fallback: just add the filename
      const currentAttachments = lesson.attachments || [];
      const updated = [...currentAttachments, file.name];
      try {
        await updateLesson(lessonId, { attachments: updated });
        setLesson(prev => ({ ...prev, attachments: updated }));
        toast({ title: 'File referenced', status: 'info', duration: 2000 });
      } catch { toast({ title: 'Upload failed', status: 'error', duration: 3000 }); }
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeAttachment = async (idx) => {
    const updated = (lesson.attachments || []).filter((_, i) => i !== idx);
    try {
      await updateLesson(lessonId, { attachments: updated });
      setLesson(prev => ({ ...prev, attachments: updated }));
      toast({ title: 'File removed', status: 'success', duration: 2000 });
    } catch { toast({ title: 'Error', status: 'error', duration: 2000 }); }
  };

  if (loading) return <Flex justify="center" py={20}><Spinner size="xl" color="blue.500" /></Flex>;
  if (error) return <Container py={20}><Alert status="error"><AlertIcon /> {error}</Alert></Container>;
  if (!lesson) return <Container py={20}><Alert status="info"><AlertIcon /> Lesson not found</Alert></Container>;

  const getVideoEmbedUrl = (url) => {
    if (!url) return null;
    // YouTube
    const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
    if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}`;
    // Direct video URL
    if (url.match(/\.(mp4|webm|ogg)(\?|$)/i)) return url;
    return null;
  };

  const embedUrl = getVideoEmbedUrl(form.videoUrl);

  return (
    <Box>
      {/* Header */}
      <Flex align="center" gap={3} mb={6}>
        <Button as={Link} to={`/educator/courses/${courseId}`} variant="ghost" size="sm" leftIcon={<FiArrowLeft />}>Back to Course</Button>
        <Box flex="1" minW={0}>
          <Heading size="lg" noOfLines={1}>{lesson.title}</Heading>
          <Text fontSize="sm" color="gray.500">Lesson #{lesson.order}</Text>
        </Box>
        <HStack spacing={2}>
          <Button colorScheme="blue" leftIcon={<FiSave />} onClick={handleSave} isLoading={saving}>Save</Button>
          <Button variant="ghost" colorScheme="red" leftIcon={<FiTrash2 />} onClick={handleDelete}>Delete</Button>
        </HStack>
      </Flex>

      <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={6}>
        {/* Left — Editor */}
        <Box>
          <Box bg={cardBg} borderRadius="xl" boxShadow="sm" p={5} borderWidth="1px" mb={4}>
            <Heading size="sm" mb={4}>Lesson Details</Heading>
            <VStack spacing={4}>
              <FormControl><FormLabel>Title</FormLabel><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></FormControl>
              <SimpleGrid columns={2} spacing={4} w="full">
                <FormControl><FormLabel>Order</FormLabel><Input type="number" value={form.order} onChange={(e) => setForm({ ...form, order: e.target.value })} /></FormControl>
                <FormControl><FormLabel>Read Time (min)</FormLabel><Input type="number" value={form.estimatedReadTime} onChange={(e) => setForm({ ...form, estimatedReadTime: e.target.value })} placeholder="15" /></FormControl>
              </SimpleGrid>
            </VStack>
          </Box>

          <Box bg={cardBg} borderRadius="xl" boxShadow="sm" p={5} borderWidth="1px" mb={4}>
            <Heading size="sm" mb={4}>Content</Heading>
            <FormControl><Textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} rows={16} minH="300px" fontFamily="monospace" fontSize="sm" placeholder="Write your lesson content here. Supports HTML and markdown..." /></FormControl>
          </Box>
        </Box>

        {/* Right — Media + Attachments */}
        <Box>
          <Box bg={cardBg} borderRadius="xl" boxShadow="sm" p={5} borderWidth="1px" mb={4}>
            <Heading size="sm" mb={4}>Video</Heading>
            <VStack spacing={3}>
              <FormControl><FormLabel>Video URL</FormLabel><Input value={form.videoUrl} onChange={(e) => setForm({ ...form, videoUrl: e.target.value })} placeholder="YouTube URL or direct video link" /></FormControl>
              <FormControl><FormLabel>Video Description</FormLabel><Textarea value={form.videoDescription} onChange={(e) => setForm({ ...form, videoDescription: e.target.value })} rows={2} placeholder="Brief description of what the video covers" /></FormControl>
            </VStack>
            {embedUrl && (
              <Box mt={4} borderRadius="lg" overflow="hidden" bg="black">
                {embedUrl.includes('youtube') ? (
                  <Box as="iframe" src={embedUrl} w="full" h="250px" allowFullScreen title="Video" />
                ) : (
                  <Box as="video" src={embedUrl} controls w="full" maxH="250px" />
                )}
              </Box>
            )}
          </Box>

          <Box bg={cardBg} borderRadius="xl" boxShadow="sm" p={5} borderWidth="1px">
            <Flex justify="space-between" align="center" mb={4}>
              <Heading size="sm">Attachments</Heading>
              <Button size="xs" variant="outline" leftIcon={<FiUpload />} onClick={() => fileInputRef.current?.click()}>
                Upload File
              </Button>
              <input ref={fileInputRef} type="file" hidden onChange={handleFileUpload} />
            </Flex>
            {(lesson.attachments || []).length === 0 ? (
              <Text fontSize="sm" color="gray.500">No files yet. Upload PDFs, images, or documents.</Text>
            ) : (
              <VStack spacing={2} align="stretch">
                {(lesson.attachments || []).map((att, idx) => (
                  <Flex key={idx} p={2} bg={useColorModeValue('gray.50', 'gray.700')} borderRadius="md" align="center" gap={3} fontSize="sm">
                    <Icon as={FiFileText} boxSize={4} color="blue.500" />
                    <Text flex={1} noOfLines={1}>{att.split('/').pop() || att}</Text>
                    <Button as="a" href={att.startsWith('http') ? att : `${API_BASE_URL}/api/uploads/${att}`} target="_blank" size="xs" variant="ghost" icon={<FiExternalLink />} aria-label="View" />
                    <IconButton icon={<FiTrash2 />} size="xs" variant="ghost" colorScheme="red" onClick={() => removeAttachment(idx)} aria-label="Remove" />
                  </Flex>
                ))}
              </VStack>
            )}
          </Box>
        </Box>
      </SimpleGrid>
    </Box>
  );
};

export default LessonEditor;
